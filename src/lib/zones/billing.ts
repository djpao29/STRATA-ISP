import { Prisma, type Zone } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { nextInvoiceNumber } from '@/lib/billing'
import { localNow as localNowIn, todayIn } from '@/lib/dates'
import { cycleInfo, lastCycleStart, suspendTimeReached } from './cycle'

const fmt = (d: Date) => new Intl.DateTimeFormat('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(d)

export type ZoneBillingResult = { zone: string; cycle: string; created: number; skipped: number; errors: number; note?: string }

/**
 * Genera las facturas del ciclo vigente de una zona. Es idempotente:
 * - un servicio cuyo periodo ya está cubierto por otra factura no se vuelve a facturar
 *   (también protege los cambios de zona);
 * - la base de datos impide dos facturas del mismo servicio para el mismo inicio de periodo;
 * - un servicio instalado después del inicio del ciclo se factura desde el ciclo siguiente.
 */
export async function generateZoneInvoices(zone: Zone, timeZone: string, now = new Date()): Promise<ZoneBillingResult> {
  const local = localNowIn(timeZone, now)
  const info = cycleInfo(zone, lastCycleStart(zone, local))
  const lastDay = new Date(info.periodEnd.getTime() - 86_400_000)
  const cycle = info.cycleDate.toISOString().slice(0, 10)

  // Protección: si la fecha de corte de este ciclo ya pasó (p. ej. el sistema se puso en marcha a mitad
  // de ciclo), no se emite: una factura nueva con el corte vencido cortaría al cliente de inmediato.
  if (suspendTimeReached(info.suspendDate, zone.suspendHour, local)) {
    return { zone: zone.name, cycle, created: 0, skipped: 0, errors: 0, note: 'Ciclo con fecha de corte ya pasada: se factura desde el siguiente' }
  }

  const services = await prisma.service.findMany({
    where: {
      tenantId: zone.tenantId,
      isActive: true,
      customer: { zoneId: zone.id, status: { in: zone.invoiceSuspended ? ['ACTIVE', 'SUSPENDED'] : ['ACTIVE'] } },
    },
    include: { plan: true },
  })

  let created = 0
  let skipped = 0
  let errors = 0
  for (const s of services) {
    if (todayIn(timeZone, s.installedAt) > info.cycleDate) {
      skipped++
      continue
    }
    const covered = await prisma.invoice.findFirst({
      where: {
        serviceId: s.id,
        status: { not: 'CANCELLED' },
        periodStart: { lte: info.cycleDate },
        OR: [{ periodEnd: { gt: info.cycleDate } }, { periodEnd: null, periodStart: info.cycleDate }],
      },
      select: { id: true },
    })
    if (covered) {
      skipped++
      continue
    }
    try {
      await prisma.$transaction(async (tx) => {
        await tx.invoice.create({
          data: {
            number: await nextInvoiceNumber(tx, zone.tenantId),
            description: `Servicio de internet ${s.plan.name} · ${fmt(info.cycleDate)} al ${fmt(lastDay)}`,
            amount: s.plan.price,
            periodStart: info.cycleDate,
            periodEnd: info.periodEnd,
            issueDate: info.cycleDate,
            dueDate: info.dueDate,
            suspendDate: info.suspendDate,
            zoneId: zone.id,
            customerId: s.customerId,
            serviceId: s.id,
            tenantId: zone.tenantId,
          },
        })
      })
      created++
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        skipped++ // otra ejecución la creó al mismo tiempo
      } else {
        errors++
        console.error(`[zonas] error al facturar servicio ${s.id}`, error)
      }
    }
  }
  return { zone: zone.name, cycle, created, skipped, errors }
}

/** Facturación de todas las zonas activas de la empresa (las que tienen facturación automática, salvo `includeManual`). */
export async function runZoneBilling(tenantId: string, opts: { now?: Date; includeManual?: boolean } = {}) {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { timezone: true } })
  const zones = await prisma.zone.findMany({
    where: { tenantId, isActive: true, ...(opts.includeManual ? {} : { autoInvoice: true }) },
  })
  const results: ZoneBillingResult[] = []
  for (const z of zones) results.push(await generateZoneInvoices(z, tenant.timezone, opts.now))
  return results
}

/** Siguiente código de cliente de la empresa (atómico). */
export async function nextCustomerCode(tx: Prisma.TransactionClient, tenantId: string) {
  const t = await tx.tenant.update({
    where: { id: tenantId },
    data: { nextCustomerCode: { increment: 1 } },
    select: { nextCustomerCode: true },
  })
  return t.nextCustomerCode - 1
}

export function formatCustomerCode(code: number | null | undefined) {
  return code ? `C-${String(code).padStart(6, '0')}` : '—'
}

/** Zonas iniciales de una empresa nueva. */
export async function ensureDefaultZones(tenantId: string) {
  const defaults = [
    { name: 'Zona 15', invoiceDay: 15, dueDay: 15, suspendDay: 20 },
    { name: 'Zona 30', invoiceDay: 30, dueDay: 30, suspendDay: 5 },
  ]
  for (const z of defaults) {
    await prisma.zone.upsert({
      where: { tenantId_name: { tenantId, name: z.name } },
      update: {},
      create: { ...z, tenantId },
    })
  }
}
