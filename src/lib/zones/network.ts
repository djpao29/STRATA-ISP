import type { NetworkAction, NetworkActionType } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { localNow as localNowIn, todayIn } from '@/lib/dates'
import { RouterOSError } from '@/lib/mikrotik/client'
import { connectionFor } from '@/lib/mikrotik/connection'
import { reconnectIp, reconnectPppoe, suspendIp, suspendPppoe } from '@/lib/mikrotik/actions'
import { shouldSuspend } from './cycle'

/**
 * Cortes y reconexiones.
 *
 * El estado del cliente (SUSPENDED / ACTIVE) se decide aquí y se aplica en el router mediante
 * una cola (network_actions) con reintentos: si el MikroTik no responde, el corte queda
 * pendiente y se reintenta. Antes de ejecutar cada acción se vuelve a comprobar el estado,
 * para no cortar nunca a un cliente que ya pagó.
 */

type Source = 'AUTO' | 'MANUAL'

/** Reintentos con espera creciente (minutos). Tras el último, la acción queda FALLIDA y visible. */
const RETRY_MINUTES = [1, 2, 5, 10, 15, 30, 60, 60, 120, 240, 480, 720]

async function enqueue(params: {
  tenantId: string
  customerId: string
  type: NetworkActionType
  source: Source
  reason: string
  userId?: string
}) {
  const services = await prisma.service.findMany({
    where: { customerId: params.customerId, isActive: true },
    select: { id: true, routerId: true },
  })
  const opposite: NetworkActionType = params.type === 'SUSPEND' ? 'RECONNECT' : 'SUSPEND'
  // Una acción nueva anula las pendientes del tipo contrario (p. ej. pagó antes del corte).
  await prisma.networkAction.updateMany({
    where: { customerId: params.customerId, type: opposite, status: 'PENDING' },
    data: { status: 'CANCELLED', finishedAt: new Date(), lastError: 'Anulada por una acción posterior' },
  })
  let queued = 0
  for (const s of services) {
    if (!s.routerId) continue // sin router asignado no hay nada que aplicar en la red
    const dup = await prisma.networkAction.findFirst({
      where: { serviceId: s.id, type: params.type, status: { in: ['PENDING', 'RUNNING'] } },
      select: { id: true },
    })
    if (dup) continue
    await prisma.networkAction.create({
      data: {
        tenantId: params.tenantId,
        customerId: params.customerId,
        serviceId: s.id,
        routerId: s.routerId,
        type: params.type,
        source: params.source,
        reason: params.reason,
        createdById: params.userId,
      },
    })
    queued++
  }
  return { services: services.length, queued }
}

export async function suspendCustomer(customerId: string, source: Source, reason: string, userId?: string) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } })
  if (!customer) return null
  if (customer.status !== 'SUSPENDED') {
    await prisma.customer.update({
      where: { id: customerId },
      data: { status: 'SUSPENDED', suspensionSource: source, suspendedAt: new Date() },
    })
  }
  const r = await enqueue({ tenantId: customer.tenantId, customerId, type: 'SUSPEND', source, reason, userId })
  await audit({
    tenantId: customer.tenantId,
    userId,
    action: source === 'AUTO' ? 'customer.suspend_auto' : 'customer.suspend',
    entity: 'Customer',
    entityId: customerId,
    details: { reason, ...r },
  })
  return r
}

export async function reconnectCustomer(customerId: string, source: Source, reason: string, userId?: string) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } })
  if (!customer) return null
  await prisma.customer.update({
    where: { id: customerId },
    data: { status: 'ACTIVE', suspensionSource: null, reconnectedAt: new Date() },
  })
  const r = await enqueue({ tenantId: customer.tenantId, customerId, type: 'RECONNECT', source, reason, userId })
  await audit({
    tenantId: customer.tenantId,
    userId,
    action: source === 'AUTO' ? 'customer.reconnect_auto' : 'customer.reconnect',
    entity: 'Customer',
    entityId: customerId,
    details: { reason, ...r },
  })
  return r
}

/** Facturas que cuentan para decidir un corte. */
function debtInvoices(customerId: string) {
  return prisma.invoice.findMany({
    where: { customerId, status: { in: ['PENDING', 'OVERDUE'] }, suspendDate: { not: null } },
    select: { status: true, suspendDate: true },
  })
}

/**
 * Corta a los clientes de zonas con corte automático que tienen facturas impagas con la
 * fecha de corte cumplida. Excluye a los marcados como exentos.
 */
export async function runSuspensions(tenantId: string, now = new Date()) {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { timezone: true } })
  const local = localNowIn(tenant.timezone, now)
  const zones = await prisma.zone.findMany({ where: { tenantId, isActive: true, autoSuspend: true } })
  let suspended = 0
  for (const zone of zones) {
    const candidates = await prisma.customer.findMany({
      where: {
        tenantId,
        zoneId: zone.id,
        status: 'ACTIVE',
        suspendExempt: false,
        invoices: { some: { status: { in: ['PENDING', 'OVERDUE'] }, suspendDate: { lte: local } } },
        // Promesa de pago vigente: no se corta hasta la fecha prometida.
        paymentPromises: { none: { status: 'ACTIVE', promisedDate: { gte: todayIn(tenant.timezone, now) } } },
      },
      select: { id: true },
    })
    for (const c of candidates) {
      const invoices = await debtInvoices(c.id)
      if (!shouldSuspend(invoices, zone.suspendHour, zone.suspendAfterInvoices, local)) continue
      await suspendCustomer(c.id, 'AUTO', `Falta de pago (${zone.name})`)
      suspended++
    }
  }
  return { suspended }
}

/**
 * Si un cliente cortado automáticamente ya no tiene deuda que justifique el corte, se reconecta.
 * Los cortes manuales nunca se revierten solos.
 */
export async function reconcileCustomer(customerId: string, now = new Date()) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { zone: true, tenant: { select: { timezone: true } } },
  })
  if (!customer || customer.status !== 'SUSPENDED' || customer.suspensionSource !== 'AUTO') return false
  if (customer.zone && !customer.zone.autoReconnect) return false
  const local = localNowIn(customer.tenant.timezone, now)
  const zone = customer.zone ?? { suspendHour: 0, suspendAfterInvoices: 1 }
  if (shouldSuspend(await debtInvoices(customerId), zone.suspendHour, zone.suspendAfterInvoices, local)) {
    const promise = await prisma.paymentPromise.findFirst({
      where: { customerId, status: 'ACTIVE', promisedDate: { gte: todayIn(customer.tenant.timezone, now) } },
    })
    if (!promise) return false
    await reconnectCustomer(customerId, 'AUTO', `Promesa de pago hasta el ${promise.promisedDate.toISOString().slice(0, 10)}`)
    return true
  }
  await reconnectCustomer(customerId, 'AUTO', 'Pago registrado: deuda saldada')
  return true
}

export async function runReconnections(tenantId: string, now = new Date()) {
  const suspended = await prisma.customer.findMany({
    where: { tenantId, status: 'SUSPENDED', suspensionSource: 'AUTO' },
    select: { id: true },
  })
  let reconnected = 0
  for (const c of suspended) if (await reconcileCustomer(c.id, now)) reconnected++
  return { reconnected }
}

const PERMANENT: Array<RouterOSError['kind']> = ['auth', 'permission', 'not_found', 'bad_request']

async function execute(action: NetworkAction) {
  const service = await prisma.service.findUnique({
    where: { id: action.serviceId },
    include: { router: true, customer: { select: { status: true, firstName: true, lastName: true } } },
  })
  if (!service) return { cancel: 'El servicio ya no existe' }

  // Validación final: nunca cortar a quien está activo ni reconectar a quien está suspendido.
  if (action.type === 'SUSPEND' && service.customer.status === 'ACTIVE') return { cancel: 'El cliente está activo (pagó antes del corte)' }
  if (action.type === 'RECONNECT' && service.customer.status !== 'ACTIVE') return { cancel: 'El cliente sigue suspendido' }

  const router = service.router
  if (!router) return { fail: 'El servicio no tiene router asignado' }
  if (router.type !== 'MIKROTIK') return { fail: 'Corte automático disponible solo para MikroTik' }

  const conn = connectionFor(router)
  const label = `${service.customer.firstName} ${service.customer.lastName}`
  if (service.mode === 'PPPoE' && service.pppoeUser) {
    return { done: action.type === 'SUSPEND' ? await suspendPppoe(conn, service.pppoeUser) : await reconnectPppoe(conn, service.pppoeUser) }
  }
  if (service.ipAddress) {
    return {
      done:
        action.type === 'SUSPEND'
          ? await suspendIp(conn, service.ipAddress, router.suspendList, label)
          : await reconnectIp(conn, service.ipAddress, router.suspendList),
    }
  }
  return { fail: 'El servicio no tiene usuario PPPoE ni IP: no se puede aplicar en el router' }
}

/** Procesa la cola de acciones pendientes cuyo momento de reintento llegó. */
export async function processNetworkActions(opts: { limit?: number; customerId?: string } = {}) {
  const due = await prisma.networkAction.findMany({
    where: { status: 'PENDING', nextAttemptAt: { lte: new Date() }, ...(opts.customerId ? { customerId: opts.customerId } : {}) },
    orderBy: { createdAt: 'asc' },
    take: opts.limit ?? 20,
  })
  let done = 0
  let failed = 0
  for (const action of due) {
    // Reclamar la acción (evita que dos procesos la ejecuten a la vez).
    const claimed = await prisma.networkAction.updateMany({ where: { id: action.id, status: 'PENDING' }, data: { status: 'RUNNING' } })
    if (claimed.count === 0) continue
    const attempts = action.attempts + 1
    try {
      const r = await execute(action)
      if ('cancel' in r) {
        await prisma.networkAction.update({ where: { id: action.id }, data: { status: 'CANCELLED', attempts, finishedAt: new Date(), lastError: r.cancel } })
      } else if ('fail' in r) {
        await prisma.networkAction.update({ where: { id: action.id }, data: { status: 'FAILED', attempts, finishedAt: new Date(), lastError: r.fail } })
        failed++
      } else {
        await prisma.$transaction([
          prisma.networkAction.update({
            where: { id: action.id },
            data: { status: 'DONE', attempts, finishedAt: new Date(), method: r.done.method, lastError: null, reason: `${action.reason} · ${r.done.detail}` },
          }),
          prisma.service.update({
            where: { id: action.serviceId },
            data: { networkState: action.type === 'SUSPEND' ? 'SUSPENDED' : 'ACTIVE', networkStateAt: new Date() },
          }),
        ])
        done++
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const permanent = error instanceof RouterOSError && PERMANENT.includes(error.kind)
      const exhausted = attempts > RETRY_MINUTES.length
      if (!(error instanceof RouterOSError)) console.error('[zonas] acción de red', error)
      await prisma.networkAction.update({
        where: { id: action.id },
        data:
          permanent || exhausted
            ? { status: 'FAILED', attempts, lastError: message, finishedAt: new Date() }
            : {
                status: 'PENDING',
                attempts,
                lastError: message,
                nextAttemptAt: new Date(Date.now() + RETRY_MINUTES[attempts - 1] * 60_000),
              },
      })
      if (permanent || exhausted) failed++
    }
  }
  return { processed: due.length, done, failed }
}

/** Ejecuta en segundo plano las acciones de un cliente (tras un pago o un corte manual). */
export function processSoon(customerId: string) {
  setTimeout(() => {
    processNetworkActions({ customerId }).catch((e) => console.error('[zonas] procesar acciones', e))
  }, 100)
}
