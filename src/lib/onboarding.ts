import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/crypto'
import { nextInvoiceNumber } from '@/lib/billing'
import { localNow, todayIn } from '@/lib/dates'
import { lastCycleStart, nextCycleStart } from '@/lib/zones/cycle'
import { nextCustomerCode } from '@/lib/zones/billing'
import { RouterOSError, rosGet } from '@/lib/mikrotik/client'
import { connectionFor } from '@/lib/mikrotik/connection'
import { ensureClientQueue, ensurePppProfile, ensurePppSecret } from '@/lib/mikrotik/plans'
import type { RosRecord } from '@/lib/mikrotik/parse'
import { getMonitoringSettings } from '@/lib/monitoring/settings'

const DAY = 86_400_000

/**
 * Monto proporcional de la primera factura: días desde la instalación hasta el próximo ciclo,
 * sobre los días del ciclo actual. Redondeado a centavos, nunca más que el precio.
 */
export function prorate(price: number, today: Date, cycleStart: Date, nextStart: Date) {
  const cycleDays = Math.max(1, Math.round((nextStart.getTime() - cycleStart.getTime()) / DAY))
  const days = Math.min(cycleDays, Math.max(1, Math.round((nextStart.getTime() - today.getTime()) / DAY)))
  return { days, cycleDays, amount: Math.min(price, Math.round(((price * days) / cycleDays) * 100) / 100) }
}

export type NewCustomerInput = {
  tenantId: string
  userId: string
  customer: {
    firstName: string
    lastName: string
    cedula?: string | null
    email?: string | null
    email2?: string | null
    phone: string
    phone2?: string | null
    address?: string | null
    province?: string | null
    city?: string | null
    neighborhood?: string | null
    coordinates?: string | null
    notes?: string | null
    status: 'ACTIVE' | 'PENDING'
    zoneId: string
    suspendExempt: boolean
  }
  service?: {
    planId: string
    routerId?: string | null
    mode: 'PPPoE' | 'DHCP' | 'STATIC_IP'
    ipAddress?: string | null
    ipv6?: string | null
    macAddress?: string | null
    pppoeUser?: string | null
    pppoePassword?: string | null
    lanInterface?: string | null
    wanInterface?: string | null
    discount: number
    discountNote?: string | null
    accessType?: 'FIBER' | 'ANTENNA' | null
    accessPoint?: string | null
    syncRouter: boolean
  }
  deviceModel?: string | null
  onu?: { existingId?: string | null; create?: { oltId: string; serial: string; slot: number; port: number } | null }
  invoice?: { mode: 'prorated' | 'full' } | null
}

/** Crea cliente, servicio, equipo, ONU y factura de instalación en una sola transacción. */
export async function createCustomerWithService(input: NewCustomerInput) {
  const { tenantId } = input
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { timezone: true, dueDays: true } })
  const zone = await prisma.zone.findFirst({ where: { id: input.customer.zoneId, tenantId } })
  if (!zone) throw new Error('La zona elegida no existe.')

  const plan = input.service ? await prisma.plan.findFirst({ where: { id: input.service.planId, tenantId, isActive: true } }) : null
  if (input.service && !plan) throw new Error('El plan elegido no existe o está inactivo.')
  const router = input.service?.routerId ? await prisma.router.findFirst({ where: { id: input.service.routerId, tenantId } }) : null
  if (input.service?.routerId && !router) throw new Error('El router elegido no existe.')

  if (input.onu?.existingId) {
    const onu = await prisma.oNU.findFirst({ where: { id: input.onu.existingId, olt: { tenantId } } })
    if (!onu) throw new Error('La ONU elegida no existe.')
    if (onu.customerId) throw new Error('La ONU elegida ya está asignada a otro cliente.')
  }
  if (input.onu?.create) {
    const olt = await prisma.oLT.findFirst({ where: { id: input.onu.create.oltId, tenantId } })
    if (!olt) throw new Error('La OLT elegida no existe.')
  }
  if (input.service?.ipAddress) {
    const dup = await prisma.service.findFirst({
      where: { tenantId, ipAddress: input.service.ipAddress },
      include: { customer: { select: { firstName: true, lastName: true } } },
    })
    if (dup) throw new Error(`La IP ${input.service.ipAddress} ya está asignada a ${dup.customer.firstName} ${dup.customer.lastName}.`)
  }

  const price = plan ? Math.max(0, Number(plan.price) - (input.service?.discount ?? 0)) : 0
  const today = todayIn(tenant.timezone)
  const local = localNow(tenant.timezone)

  const result = await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.create({
      data: { ...input.customer, code: await nextCustomerCode(tx, tenantId), tenantId },
    })
    let serviceId: string | null = null
    if (input.service && plan) {
      const { pppoePassword, ...s } = input.service
      const service = await tx.service.create({
        data: {
          ...s,
          routerId: router?.id ?? null,
          pppoePasswordEnc: pppoePassword ? encrypt(pppoePassword) : null,
          customerId: customer.id,
          tenantId,
        },
      })
      serviceId = service.id
    }
    if (input.deviceModel) {
      await tx.customerDevice.create({ data: { tenantId, customerId: customer.id, serviceId, model: input.deviceModel, macAddress: input.service?.macAddress?.toUpperCase() ?? null } })
    }
    if (input.onu?.existingId) {
      await tx.oNU.update({ where: { id: input.onu.existingId }, data: { customerId: customer.id } })
    } else if (input.onu?.create) {
      await tx.oNU.create({ data: { ...input.onu.create, serial: input.onu.create.serial.toUpperCase(), customerId: customer.id, name: `${customer.firstName} ${customer.lastName}` } })
    }

    let invoice: { number: string; amount: number } | null = null
    if (input.invoice && plan && serviceId && price > 0) {
      const start = lastCycleStart(zone, local)
      const next = nextCycleStart(zone, local)
      const p = prorate(price, today, start, next)
      const amount = input.invoice.mode === 'full' ? price : p.amount
      const fmt = (d: Date) => new Intl.DateTimeFormat('es-DO', { dateStyle: 'medium', timeZone: 'UTC' }).format(d)
      const number = await nextInvoiceNumber(tx, tenantId)
      await tx.invoice.create({
        data: {
          number,
          description:
            input.invoice.mode === 'full'
              ? `Instalación · servicio ${plan.name} hasta ${fmt(new Date(next.getTime() - DAY))}`
              : `Instalación · servicio ${plan.name} proporcional ${p.days} de ${p.cycleDays} días (${fmt(today)} al ${fmt(new Date(next.getTime() - DAY))})`,
          amount: new Prisma.Decimal(amount),
          periodStart: today,
          // Hasta el próximo ciclo: así la zona factura normalmente desde ese ciclo.
          periodEnd: next,
          issueDate: today,
          dueDate: new Date(today.getTime() + tenant.dueDays * DAY),
          zoneId: zone.id,
          customerId: customer.id,
          serviceId,
          tenantId,
        },
      })
      invoice = { number, amount }
    }
    return { customer, serviceId, invoice }
  })

  // Configuración en el MikroTik (después de guardar: si el router falla, el cliente queda creado).
  let network: { ok: boolean; message: string } | null = null
  if (input.service && plan && router && input.service.syncRouter && router.type === 'MIKROTIK') {
    try {
      const settings = await getMonitoringSettings(tenantId)
      const conn = connectionFor(router, settings.requestTimeoutSec)
      const name = `${input.customer.firstName} ${input.customer.lastName}`.replace(/[^\p{L}\p{N} ._-]/gu, '').slice(0, 50) || `cliente-${result.customer.code}`
      if (plan.kind === 'PPPOE') {
        if (!input.service.pppoeUser) throw new RouterOSError('Falta el usuario PPPoE.', 'bad_request')
        const profile = plan.pppProfile || plan.name
        // Solo se crea el perfil si no existe: uno existente (p. ej. importado) no se modifica aquí.
        const exists = (await rosGet<RosRecord[]>(conn, '/ppp/profile', ['name'], { name: profile })).some((r) => r.name === profile)
        if (!exists) await ensurePppProfile(conn, profile, plan)
        const r = await ensurePppSecret(conn, {
          name: input.service.pppoeUser,
          password: input.service.pppoePassword ?? null,
          profile,
          remoteAddress: input.service.ipAddress,
          comment: `${name} · ${result.customer.code ? `C-${String(result.customer.code).padStart(6, '0')}` : ''}`,
        })
        network = { ok: true, message: r === 'created' ? `Usuario PPPoE creado en ${router.name} con el perfil ${profile}` : `El usuario PPPoE ya existía en ${router.name}; se le asignó el perfil ${profile}` }
      } else if (input.service.ipAddress) {
        const r = await ensureClientQueue(conn, { name, ip: input.service.ipAddress }, plan)
        network = { ok: true, message: r === 'created' ? `Cola simple creada en ${router.name}` : `La cola de ${input.service.ipAddress} ya existía en ${router.name}; se ajustó al plan` }
      } else {
        network = { ok: false, message: 'No se configuró el MikroTik: el plan Simple Queue necesita la IP del cliente.' }
      }
    } catch (e) {
      network = { ok: false, message: `No se pudo configurar ${router.name}: ${e instanceof Error ? e.message.replace(/\.+$/, '') : 'error desconocido'}. El cliente quedó guardado; usa «Sincronizar» en Planes cuando el router responda.` }
    }
  }

  return { ...result, network }
}
