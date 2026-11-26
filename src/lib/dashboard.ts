import { prisma } from '@/lib/prisma'
import { markOverdueInvoices } from '@/lib/billing'
import { monthStartIn, todayIn } from '@/lib/dates'
import { monthlyRevenue } from '@/lib/reports'
import { toNumber } from '@/lib/format'

const SHORT_MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

/** Altas de clientes por mes (en la hora local de la empresa) y total acumulado. */
async function customerGrowth(tenantId: string, timeZone: string, months: number) {
  const current = monthStartIn(timeZone)
  const from = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - (months - 1), 1))
  const rows = await prisma.$queryRaw<Array<{ month: Date; total: number }>>`
    SELECT date_trunc('month', ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}) AS month, COUNT(*)::int AS total
    FROM customers
    WHERE "tenantId" = ${tenantId} AND ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone} >= ${from}
    GROUP BY 1`
  const key = (d: Date) => `${d.getUTCFullYear()}-${d.getUTCMonth()}`
  const byMonth = new Map(rows.map((r) => [key(new Date(r.month)), r.total]))
  return Array.from({ length: months }, (_, i) => {
    const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + i, 1))
    return { month: SHORT_MONTHS[d.getUTCMonth()], altas: byMonth.get(key(d)) ?? 0 }
  })
}

/** Todos los datos del Dashboard, de la base de datos. */
export async function dashboardData(tenantId: string, timeZone: string, opts: { months: number; withMoney: boolean }) {
  if (opts.withMoney) await markOverdueInvoices(tenantId)
  const today = todayIn(timeZone)
  const tomorrow = new Date(today.getTime() + 86_400_000)
  const monthStart = monthStartIn(timeZone)

  const [
    totalCustomers,
    activeCustomers,
    suspendedCustomers,
    routersTotal,
    routersOnline,
    plans,
    pendingPayments,
    pendingCuts,
    failedCuts,
    openTickets,
    resolvedTickets,
    recentCustomers,
    activity,
  ] = await Promise.all([
    prisma.customer.count({ where: { tenantId, status: { not: 'CANCELLED' } } }),
    prisma.customer.count({ where: { tenantId, status: 'ACTIVE' } }),
    prisma.customer.count({ where: { tenantId, status: 'SUSPENDED' } }),
    prisma.router.count({ where: { tenantId } }),
    prisma.router.count({ where: { tenantId, status: { in: ['ONLINE', 'DEGRADED'] } } }),
    prisma.plan.count({ where: { tenantId, isActive: true } }),
    prisma.payment.count({ where: { tenantId, status: 'PENDING' } }),
    prisma.networkAction.count({ where: { tenantId, status: { in: ['PENDING', 'RUNNING'] } } }),
    prisma.networkAction.count({ where: { tenantId, status: 'FAILED' } }),
    prisma.ticket.count({ where: { tenantId, status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
    prisma.ticket.count({ where: { tenantId, status: { in: ['RESOLVED', 'CLOSED'] } } }),
    prisma.customer.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 6,
      include: { zone: { select: { name: true } }, services: { where: { isActive: true }, include: { plan: { select: { name: true } } } } },
    }),
    prisma.auditLog.findMany({
      where: { tenantId, createdAt: { gte: new Date(Date.now() - 14 * 86_400_000) } },
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: { user: { select: { name: true } } },
    }),
  ])

  const growth = await customerGrowth(tenantId, timeZone, opts.months)
  // Altas de hoy y de este mes (fecha local de la empresa).
  const [newToday, newThisMonth] = await Promise.all([
    prisma.$queryRaw<Array<{ n: number }>>`
      SELECT COUNT(*)::int AS n FROM customers
      WHERE "tenantId" = ${tenantId} AND (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone})::date = ${today}::date`,
    prisma.$queryRaw<Array<{ n: number }>>`
      SELECT COUNT(*)::int AS n FROM customers
      WHERE "tenantId" = ${tenantId} AND ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone} >= ${monthStart}`,
  ])

  let money = null
  if (opts.withMoney) {
    const [paidToday, monthPayments, pending, monthInvoiced, revenue] = await Promise.all([
      prisma.payment.aggregate({ where: { tenantId, status: 'APPROVED', paidDate: { gte: today, lt: tomorrow } }, _sum: { amount: true }, _count: true }),
      prisma.payment.aggregate({ where: { tenantId, status: 'APPROVED', paidDate: { gte: monthStart } }, _sum: { amount: true }, _count: true }),
      prisma.invoice.aggregate({ where: { tenantId, status: { in: ['PENDING', 'OVERDUE'] } }, _sum: { amount: true }, _count: true }),
      prisma.invoice.aggregate({ where: { tenantId, status: { not: 'CANCELLED' }, issueDate: { gte: monthStart } }, _sum: { amount: true } }),
      monthlyRevenue(tenantId, timeZone, opts.months),
    ])
    const monthCollected = toNumber(monthPayments._sum.amount)
    const pendingTotal = toNumber(pending._sum.amount)
    // % cobrado sobre lo que hay que cobrar (cobrado este mes + pendiente).
    const base = monthCollected + pendingTotal
    money = {
      paidToday: toNumber(paidToday._sum.amount),
      paidTodayCount: paidToday._count,
      pendingTotal,
      pendingCount: pending._count,
      collectedPct: base > 0 ? Math.round((monthCollected / base) * 100) : 0,
      monthCollected,
      monthPaymentsCount: monthPayments._count,
      monthInvoiced: toNumber(monthInvoiced._sum.amount),
      revenue,
    }
  }

  return {
    totalCustomers,
    activeCustomers,
    suspendedCustomers,
    routersTotal,
    routersOnline,
    plans,
    pendingPayments,
    pendingCuts,
    failedCuts,
    openTickets,
    resolvedTickets,
    recentCustomers,
    activity,
    growth,
    newToday: newToday[0]?.n ?? 0,
    newThisMonth: newThisMonth[0]?.n ?? 0,
    money,
  }
}
