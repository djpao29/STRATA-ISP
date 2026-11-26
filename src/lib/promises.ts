import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { todayIn } from '@/lib/dates'

/** Días máximos que puede durar una promesa de pago. */
export const MAX_PROMISE_DAYS = 30

/**
 * Resultado de una promesa (función pura, probada con tests):
 * - si el cliente ya no debe nada → cumplida;
 * - si pasó la fecha prometida y sigue debiendo → incumplida;
 * - en otro caso sigue vigente (el día prometido todavía cuenta).
 */
export function promiseOutcome(p: { promisedDate: Date; today: Date; hasDebt: boolean }): 'ACTIVE' | 'FULFILLED' | 'BROKEN' {
  if (!p.hasDebt) return 'FULFILLED'
  return p.today > p.promisedDate ? 'BROKEN' : 'ACTIVE'
}

export function validatePromiseDate(promisedDate: Date, today: Date) {
  if (promisedDate < today) return 'La fecha prometida no puede ser anterior a hoy.'
  if (promisedDate.getTime() - today.getTime() > MAX_PROMISE_DAYS * 86_400_000) {
    return `La promesa no puede superar ${MAX_PROMISE_DAYS} días.`
  }
  return null
}

async function hasDebt(customerId: string) {
  return (await prisma.invoice.count({ where: { customerId, status: { in: ['PENDING', 'OVERDUE'] } } })) > 0
}

/** Promesa vigente de un cliente (si la hay). */
export async function activePromise(customerId: string, timeZone: string) {
  return prisma.paymentPromise.findFirst({
    where: { customerId, status: 'ACTIVE', promisedDate: { gte: todayIn(timeZone) } },
    orderBy: { promisedDate: 'desc' },
  })
}

/** Tras un pago: si el cliente ya no debe, sus promesas activas quedan cumplidas. */
export async function resolvePromisesForCustomer(customerId: string) {
  if (await hasDebt(customerId)) return 0
  const r = await prisma.paymentPromise.updateMany({
    where: { customerId, status: 'ACTIVE' },
    data: { status: 'FULFILLED', resolvedAt: new Date() },
  })
  return r.count
}

/** Tarea programada: cierra las promesas vencidas (cumplidas o incumplidas). */
export async function runPromises(tenantId: string, now = new Date()) {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { timezone: true } })
  const today = todayIn(tenant.timezone, now)
  const active = await prisma.paymentPromise.findMany({ where: { tenantId, status: 'ACTIVE' } })
  let fulfilled = 0
  let broken = 0
  for (const p of active) {
    const outcome = promiseOutcome({ promisedDate: p.promisedDate, today, hasDebt: await hasDebt(p.customerId) })
    if (outcome === 'ACTIVE') continue
    await prisma.paymentPromise.update({ where: { id: p.id }, data: { status: outcome, resolvedAt: new Date() } })
    await audit({ tenantId, action: outcome === 'FULFILLED' ? 'promise.fulfilled' : 'promise.broken', entity: 'Customer', entityId: p.customerId })
    if (outcome === 'FULFILLED') fulfilled++
    else broken++
  }
  return { fulfilled, broken }
}
