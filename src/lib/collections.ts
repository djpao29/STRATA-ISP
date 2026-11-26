import { prisma } from '@/lib/prisma'
import { toNumber } from '@/lib/format'
import { markOverdueInvoices } from '@/lib/billing'
import { monthStartIn, todayIn } from '@/lib/dates'

const DAY = 86_400_000

/** Tramo de antigüedad de una deuda según los días de atraso (función pura). */
export function agingBucket(daysLate: number): 'AL_DIA' | 'D1_30' | 'D31_60' | 'D61_90' | 'D90' {
  if (daysLate <= 0) return 'AL_DIA'
  if (daysLate <= 30) return 'D1_30'
  if (daysLate <= 60) return 'D31_60'
  if (daysLate <= 90) return 'D61_90'
  return 'D90'
}

export const AGING_LABEL = {
  AL_DIA: 'Por vencer',
  D1_30: '1-30 días',
  D31_60: '31-60 días',
  D61_90: '61-90 días',
  D90: 'Más de 90 días',
} as const

/** Clientes con saldo pendiente, con su antigüedad, corte y promesa. */
export async function pendingByCustomer(tenantId: string, timeZone: string) {
  await markOverdueInvoices(tenantId)
  const today = todayIn(timeZone)
  const customers = await prisma.customer.findMany({
    where: { tenantId, invoices: { some: { status: { in: ['PENDING', 'OVERDUE'] } } } },
    include: {
      zone: { select: { id: true, name: true } },
      invoices: {
        where: { status: { in: ['PENDING', 'OVERDUE'] } },
        orderBy: { dueDate: 'asc' },
        include: { payments: { where: { status: 'APPROVED' }, select: { amount: true } } },
      },
      paymentPromises: { where: { status: 'ACTIVE' }, orderBy: { promisedDate: 'desc' }, take: 1 },
    },
  })
  return customers.map((c) => {
    const balance = c.invoices.reduce(
      (s, i) => s + toNumber(i.amount) - i.payments.reduce((p, x) => p + toNumber(x.amount), 0),
      0
    )
    const oldest = c.invoices[0]
    const daysLate = Math.max(0, Math.floor((today.getTime() - oldest.dueDate.getTime()) / DAY))
    const nextCut = c.invoices.find((i) => i.suspendDate)?.suspendDate ?? null
    return {
      id: c.id,
      code: c.code,
      name: `${c.firstName} ${c.lastName}`,
      phone: c.phone,
      status: c.status,
      zone: c.zone,
      invoices: c.invoices.length,
      balance: Math.round(balance * 100) / 100,
      oldestInvoiceId: oldest.id,
      oldestNumber: oldest.number,
      oldestDue: oldest.dueDate,
      daysLate,
      bucket: agingBucket(daysLate),
      nextCut,
      promise: c.paymentPromises[0] ?? null,
    }
  })
}

/** Indicadores del dashboard de cobros. */
export async function collectionsDashboard(tenantId: string, timeZone: string) {
  const today = todayIn(timeZone)
  const tomorrow = new Date(today.getTime() + DAY)
  const weekAgo = new Date(today.getTime() - 6 * DAY)
  const monthStart = monthStartIn(timeZone)
  const approved = { tenantId, status: 'APPROVED' as const }

  const [pending, todayAgg, weekAgg, monthAgg, invoicedMonth, byDay, byAccount, byUser, monthPayments, reports, promisesDue, accounts, users] =
    await Promise.all([
      pendingByCustomer(tenantId, timeZone),
      prisma.payment.aggregate({ where: { ...approved, paidDate: { gte: today, lt: tomorrow } }, _sum: { amount: true }, _count: true }),
      prisma.payment.aggregate({ where: { ...approved, paidDate: { gte: weekAgo, lt: tomorrow } }, _sum: { amount: true }, _count: true }),
      prisma.payment.aggregate({ where: { ...approved, paidDate: { gte: monthStart } }, _sum: { amount: true }, _count: true }),
      prisma.invoice.aggregate({ where: { tenantId, status: { not: 'CANCELLED' }, issueDate: { gte: monthStart } }, _sum: { amount: true } }),
      prisma.payment.groupBy({ by: ['paidDate'], where: { ...approved, paidDate: { gte: monthStart } }, _sum: { amount: true } }),
      prisma.payment.groupBy({ by: ['accountId'], where: { ...approved, paidDate: { gte: monthStart } }, _sum: { amount: true }, _count: true }),
      prisma.payment.groupBy({ by: ['createdById'], where: { ...approved, paidDate: { gte: monthStart } }, _sum: { amount: true }, _count: true }),
      prisma.payment.findMany({
        where: { ...approved, paidDate: { gte: monthStart } },
        select: { amount: true, customer: { select: { zone: { select: { name: true } } } } },
      }),
      prisma.payment.count({ where: { tenantId, status: 'PENDING' } }),
      prisma.paymentPromise.findMany({
        where: { tenantId, status: 'ACTIVE', promisedDate: { lte: new Date(today.getTime() + 7 * DAY) } },
        orderBy: { promisedDate: 'asc' },
        include: { customer: { select: { id: true, firstName: true, lastName: true } } },
      }),
      prisma.paymentAccount.findMany({ where: { tenantId }, select: { id: true, name: true } }),
      prisma.user.findMany({ where: { tenantId }, select: { id: true, name: true } }),
    ])

  // Cobros por día del mes en curso.
  const daysInMonth = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0)).getUTCDate()
  const perDay = new Map<number, number>()
  for (const r of byDay) perDay.set(r.paidDate.getUTCDate(), (perDay.get(r.paidDate.getUTCDate()) ?? 0) + toNumber(r._sum.amount))
  const daily = Array.from({ length: Math.min(daysInMonth, today.getUTCDate()) }, (_, i) => ({ day: String(i + 1), cobrado: Math.round((perDay.get(i + 1) ?? 0) * 100) / 100 }))

  const zoneTotals = new Map<string, number>()
  for (const p of monthPayments) {
    const z = p.customer.zone?.name ?? 'Sin zona'
    zoneTotals.set(z, (zoneTotals.get(z) ?? 0) + toNumber(p.amount))
  }

  const aging = (Object.keys(AGING_LABEL) as Array<keyof typeof AGING_LABEL>).map((b) => {
    const rows = pending.filter((p) => p.bucket === b)
    return { bucket: b, label: AGING_LABEL[b], customers: rows.length, amount: Math.round(rows.reduce((s, r) => s + r.balance, 0) * 100) / 100 }
  })

  const accountName = new Map(accounts.map((a) => [a.id, a.name]))
  const userName = new Map(users.map((u) => [u.id, u.name]))
  const collectedMonth = toNumber(monthAgg._sum.amount)
  const invoicedTotal = toNumber(invoicedMonth._sum.amount)
  const receivable = pending.reduce((s, p) => s + p.balance, 0)

  return {
    today: { amount: toNumber(todayAgg._sum.amount), count: todayAgg._count },
    week: { amount: toNumber(weekAgg._sum.amount), count: weekAgg._count },
    month: { amount: collectedMonth, count: monthAgg._count },
    receivable: Math.round(receivable * 100) / 100,
    overdue: Math.round(pending.filter((p) => p.daysLate > 0).reduce((s, p) => s + p.balance, 0) * 100) / 100,
    debtors: pending.length,
    recovery: invoicedTotal > 0 ? Math.round((collectedMonth / invoicedTotal) * 1000) / 10 : null,
    invoicedMonth: invoicedTotal,
    daily,
    byAccount: byAccount
      .map((r) => ({ name: r.accountId ? accountName.get(r.accountId) ?? '—' : 'Sin forma de pago', amount: toNumber(r._sum.amount), count: r._count }))
      .sort((a, b) => b.amount - a.amount),
    byUser: byUser
      .map((r) => ({ name: r.createdById ? userName.get(r.createdById) ?? '—' : 'Sistema', amount: toNumber(r._sum.amount), count: r._count }))
      .sort((a, b) => b.amount - a.amount),
    byZone: [...zoneTotals.entries()].map(([name, amount]) => ({ name, amount: Math.round(amount * 100) / 100 })).sort((a, b) => b.amount - a.amount),
    aging,
    reportsToReview: reports,
    promisesDue,
    topDebtors: [...pending].sort((a, b) => b.balance - a.balance).slice(0, 8),
  }
}
