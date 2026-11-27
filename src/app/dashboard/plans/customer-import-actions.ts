'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireActionUser } from '@/lib/session'
import { audit } from '@/lib/audit'
import { RouterOSError } from '@/lib/mikrotik/client'
import { connectionFor } from '@/lib/mikrotik/connection'
import { getSimpleQueues, groupQueueSpeeds, queueClients, speedKey, speedPlanName, splitQueueName } from '@/lib/mikrotik/plans'
import { getMonitoringSettings } from '@/lib/monitoring/settings'
import { createCustomerWithService } from '@/lib/onboarding'
import { ensureSpeedPlans } from '@/lib/queue-import'

/** Tope por importación, para que una sola corrida no se alargue demasiado. */
const MAX_PER_RUN = 500

export type QueueCustomerRow = {
  queue: string
  ip: string
  firstName: string
  lastName: string
  speed: string
  plan: string | null
  disabled: boolean
  /** Cliente que ya tiene esta IP en el sistema (no se importa). */
  existing: string | null
}

export type QueuePreview =
  | { ok: true; router: string; total: number; ignored: number; rows: QueueCustomerRow[]; newCount: number; newPlans: number }
  | { ok: false; error: string }

const errorText = (e: unknown) => (e instanceof RouterOSError || e instanceof Error ? e.message : 'Error desconocido')

/** Lee las colas del router y arma la lista de clientes (sin guardar nada). */
async function readQueueCustomers(tenantId: string, routerId: string) {
  const router = await prisma.router.findFirst({ where: { id: routerId, tenantId, type: 'MIKROTIK' } })
  if (!router) throw new Error('El router no existe.')
  const settings = await getMonitoringSettings(tenantId)
  let rows
  try {
    rows = await getSimpleQueues(connectionFor(router, settings.requestTimeoutSec))
  } catch (e) {
    throw new Error(`${router.name}: ${errorText(e)}`)
  }
  const { clients, ignored } = queueClients(rows)
  const services = await prisma.service.findMany({
    where: { tenantId, ipAddress: { in: clients.map((c) => c.ip) } },
    select: { ipAddress: true, customer: { select: { firstName: true, lastName: true } } },
  })
  const taken = new Map(services.map((s) => [s.ipAddress!, `${s.customer.firstName} ${s.customer.lastName}`.trim()]))
  const plans = await prisma.plan.findMany({
    where: { tenantId, kind: 'SIMPLE_QUEUE' },
    select: { name: true, upload: true, download: true, burst: true, priorityUp: true, priorityDown: true },
  })
  const planByKey = new Map(plans.map((p) => [speedKey({ ...p, burst: p.burst || null }), p.name]))
  // Una IP repetida en dos colas: solo cuenta la primera.
  const seen = new Set<string>()
  const list = clients.filter((c) => (seen.has(c.ip) ? false : (seen.add(c.ip), true)))
  return { router, total: rows.length, ignored: ignored + (clients.length - list.length), clients: list, taken, planByKey, rows }
}

/** Vista previa: qué clientes se crearían y con qué plan. Solo lee. */
export async function previewQueueCustomers(routerId: string): Promise<QueuePreview> {
  try {
    const user = await requireActionUser('customers')
    const r = await readQueueCustomers(user.tenantId, routerId)
    const rows: QueueCustomerRow[] = r.clients.map((c) => ({
      queue: c.queue,
      ip: c.ip,
      ...splitQueueName(c.queue),
      speed: speedPlanName(c.speed),
      plan: r.planByKey.get(speedKey(c.speed)) ?? null,
      disabled: c.disabled,
      existing: r.taken.get(c.ip) ?? null,
    }))
    const fresh = rows.filter((x) => !x.existing)
    const newPlans = new Set(r.clients.filter((c) => !r.taken.has(c.ip) && !r.planByKey.has(speedKey(c.speed))).map((c) => speedKey(c.speed))).size
    return { ok: true, router: r.router.name, total: r.total, ignored: r.ignored, rows, newCount: fresh.length, newPlans }
  } catch (e) {
    return { ok: false, error: errorText(e) }
  }
}

export type QueueImportResult = { ok: true; message: string; errors: string[] } | { ok: false; error: string }

/**
 * Crea un cliente activo por cada cola nueva, con su servicio (IP fija, plan según la velocidad
 * de la cola, router). No escribe nada en el MikroTik: la cola ya existe. Sin factura de instalación.
 */
export async function importQueueCustomers(routerId: string, zoneId: string): Promise<QueueImportResult> {
  try {
    const user = await requireActionUser('customers')
    const zone = await prisma.zone.findFirst({ where: { id: zoneId, tenantId: user.tenantId } })
    if (!zone) throw new Error('Elige la zona de los clientes.')
    const r = await readQueueCustomers(user.tenantId, routerId)
    const pending = r.clients.filter((c) => !r.taken.has(c.ip))
    if (pending.length === 0) return { ok: true, message: 'No hay clientes nuevos: todas las colas ya están en el sistema.', errors: [] }
    const batch = pending.slice(0, MAX_PER_RUN)

    // Planes que faltan (precio 0), solo para las velocidades de los clientes que se importan.
    const speeds = groupQueueSpeeds(r.rows).speeds.filter((s) => batch.some((c) => speedKey(c.speed) === speedKey(s)))
    const plans = await ensureSpeedPlans(user.tenantId, r.router.name, speeds)

    let created = 0
    const errors: string[] = []
    for (const c of batch) {
      const planId = plans.byKey.get(speedKey(c.speed))
      if (!planId) continue
      try {
        await createCustomerWithService({
          tenantId: user.tenantId,
          userId: user.id,
          customer: {
            ...splitQueueName(c.queue),
            phone: '',
            notes: [`Importado de la cola «${c.queue}» de ${r.router.name}.`, c.comment].filter(Boolean).join(' '),
            status: 'ACTIVE',
            zoneId: zone.id,
            suspendExempt: false,
          },
          service: {
            planId,
            routerId: r.router.id,
            mode: 'STATIC_IP',
            ipAddress: c.ip,
            discount: 0,
            syncRouter: false,
          },
          invoice: null,
        })
        created++
      } catch (e) {
        errors.push(`${c.queue} (${c.ip}): ${errorText(e)}`)
      }
    }
    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'customer.import',
      entity: 'Router',
      entityId: r.router.id,
      details: { source: '/queue/simple', zone: zone.name, created, plansCreated: plans.created, errors: errors.length },
    })
    revalidatePath('/dashboard/plans')
    revalidatePath('/dashboard/customers')
    const left = pending.length - batch.length
    return {
      ok: true,
      message:
        `${created} cliente(s) importado(s) de ${r.router.name} a la zona ${zone.name}` +
        (plans.created ? `; ${plans.created} plan(es) nuevo(s) con precio $0, ponles precio` : '') +
        (errors.length ? `; ${errors.length} con error` : '') +
        (left > 0 ? `. Quedan ${left}: vuelve a importar para seguir` : '') +
        '.',
      errors: errors.slice(0, 20),
    }
  } catch (e) {
    return { ok: false, error: errorText(e) }
  }
}
