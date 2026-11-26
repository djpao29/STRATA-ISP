import { prisma } from '@/lib/prisma'
import type { MonthlyPoint } from '@/components/dashboard/revenue-chart'
import { monthStartIn } from '@/lib/dates'

const SHORT_MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

/** Facturado (por fecha de emisión, sin anuladas) y cobrado (pagos aprobados) por mes, últimos N meses. */
export async function monthlyRevenue(tenantId: string, timeZone: string, months = 12): Promise<MonthlyPoint[]> {
  const current = monthStartIn(timeZone)
  const from = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - (months - 1), 1))

  const [invoiced, collected] = await Promise.all([
    prisma.$queryRaw<Array<{ month: Date; total: number }>>`
      SELECT date_trunc('month', "issueDate") AS month, SUM(amount)::float AS total
      FROM invoices
      WHERE "tenantId" = ${tenantId} AND status <> 'CANCELLED' AND "issueDate" >= ${from}
      GROUP BY 1`,
    prisma.$queryRaw<Array<{ month: Date; total: number }>>`
      SELECT date_trunc('month', "paidDate") AS month, SUM(amount)::float AS total
      FROM payments
      WHERE "tenantId" = ${tenantId} AND status = 'APPROVED' AND "paidDate" >= ${from}
      GROUP BY 1`,
  ])

  const key = (d: Date) => `${d.getUTCFullYear()}-${d.getUTCMonth()}`
  const inv = new Map(invoiced.map((r) => [key(new Date(r.month)), r.total]))
  const col = new Map(collected.map((r) => [key(new Date(r.month)), r.total]))

  return Array.from({ length: months }, (_, i) => {
    const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + i, 1))
    return {
      month: `${SHORT_MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`,
      facturado: Math.round((inv.get(key(d)) ?? 0) * 100) / 100,
      cobrado: Math.round((col.get(key(d)) ?? 0) * 100) / 100,
    }
  })
}

/** Clientes con mayor saldo pendiente. */
export async function topDebtors(tenantId: string, take = 10) {
  const rows = await prisma.invoice.groupBy({
    by: ['customerId'],
    where: { tenantId, status: { in: ['PENDING', 'OVERDUE'] } },
    _sum: { amount: true },
    _count: { _all: true },
    orderBy: { _sum: { amount: 'desc' } },
    take,
  })
  const customers = await prisma.customer.findMany({
    where: { id: { in: rows.map((r) => r.customerId) } },
    select: { id: true, firstName: true, lastName: true, phone: true, status: true },
  })
  const byId = new Map(customers.map((c) => [c.id, c]))
  return rows.map((r) => ({ customer: byId.get(r.customerId)!, amount: r._sum.amount, invoices: r._count._all }))
}
