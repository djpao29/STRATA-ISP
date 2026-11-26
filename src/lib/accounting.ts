import { prisma } from '@/lib/prisma'
import { toNumber } from '@/lib/format'

const SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

/**
 * Contabilidad de caja: ingresos = pagos APROBADOS (por fecha de pago),
 * egresos = gastos (por fecha del gasto).
 */
export async function accountingSummary(tenantId: string, start: Date, end: Date) {
  const [income, expenses, incomeByAccount, expensesByCategory, accounts, categories] = await Promise.all([
    prisma.payment.aggregate({ where: { tenantId, status: 'APPROVED', paidDate: { gte: start, lt: end } }, _sum: { amount: true }, _count: true }),
    prisma.expense.aggregate({ where: { tenantId, date: { gte: start, lt: end } }, _sum: { amount: true }, _count: true }),
    prisma.payment.groupBy({ by: ['accountId'], where: { tenantId, status: 'APPROVED', paidDate: { gte: start, lt: end } }, _sum: { amount: true } }),
    prisma.expense.groupBy({ by: ['categoryId'], where: { tenantId, date: { gte: start, lt: end } }, _sum: { amount: true } }),
    prisma.paymentAccount.findMany({ where: { tenantId }, select: { id: true, name: true } }),
    prisma.expenseCategory.findMany({ where: { tenantId }, select: { id: true, name: true } }),
  ])
  const accountName = new Map(accounts.map((a) => [a.id, a.name]))
  const categoryName = new Map(categories.map((c) => [c.id, c.name]))
  const totalIncome = toNumber(income._sum.amount)
  const totalExpenses = toNumber(expenses._sum.amount)
  return {
    income: totalIncome,
    incomeCount: income._count,
    expenses: totalExpenses,
    expensesCount: expenses._count,
    profit: Math.round((totalIncome - totalExpenses) * 100) / 100,
    margin: totalIncome > 0 ? Math.round(((totalIncome - totalExpenses) / totalIncome) * 1000) / 10 : null,
    incomeByAccount: incomeByAccount
      .map((r) => ({ name: r.accountId ? accountName.get(r.accountId) ?? '—' : 'Sin forma de pago', amount: toNumber(r._sum.amount) }))
      .sort((a, b) => b.amount - a.amount),
    expensesByCategory: expensesByCategory
      .map((r) => ({ name: categoryName.get(r.categoryId) ?? '—', amount: toNumber(r._sum.amount) }))
      .sort((a, b) => b.amount - a.amount),
  }
}

/** Ingresos y egresos de los últimos 12 meses hasta `end` (exclusivo). */
export async function incomeVsExpenses(tenantId: string, end: Date) {
  const from = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 12, 1))
  const [inc, exp] = await Promise.all([
    prisma.$queryRaw<Array<{ m: Date; total: number }>>`
      SELECT date_trunc('month', "paidDate") AS m, SUM(amount)::float AS total FROM payments
      WHERE "tenantId" = ${tenantId} AND status = 'APPROVED' AND "paidDate" >= ${from} AND "paidDate" < ${end} GROUP BY 1`,
    prisma.$queryRaw<Array<{ m: Date; total: number }>>`
      SELECT date_trunc('month', "date") AS m, SUM(amount)::float AS total FROM expenses
      WHERE "tenantId" = ${tenantId} AND "date" >= ${from} AND "date" < ${end} GROUP BY 1`,
  ])
  const key = (d: Date) => `${d.getUTCFullYear()}-${d.getUTCMonth()}`
  const i = new Map(inc.map((r) => [key(new Date(r.m)), r.total]))
  const e = new Map(exp.map((r) => [key(new Date(r.m)), r.total]))
  return Array.from({ length: 12 }, (_, n) => {
    const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + n + 1, 1))
    const ingresos = Math.round((i.get(key(d)) ?? 0) * 100) / 100
    const gastos = Math.round((e.get(key(d)) ?? 0) * 100) / 100
    return { month: `${SHORT[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`, ingresos, gastos, utilidad: Math.round((ingresos - gastos) * 100) / 100 }
  })
}

export type LedgerEntry = {
  id: string
  date: Date
  kind: 'INGRESO' | 'EGRESO'
  concept: string
  detail: string
  account: string
  amount: number
  balance: number
  href: string
}

/** Libro de movimientos del periodo, ordenado por fecha, con saldo acumulado. */
export async function ledger(tenantId: string, start: Date, end: Date): Promise<LedgerEntry[]> {
  const [payments, expenses] = await Promise.all([
    prisma.payment.findMany({
      where: { tenantId, status: 'APPROVED', paidDate: { gte: start, lt: end } },
      select: {
        id: true, paidDate: true, amount: true, reference: true, createdAt: true,
        customer: { select: { firstName: true, lastName: true } },
        invoice: { select: { id: true, number: true } },
        account: { select: { name: true } },
      },
    }),
    prisma.expense.findMany({
      where: { tenantId, date: { gte: start, lt: end } },
      select: {
        id: true, date: true, amount: true, description: true, supplier: true, reference: true, createdAt: true,
        category: { select: { name: true } },
        account: { select: { name: true } },
      },
    }),
  ])
  const rows = [
    ...payments.map((p) => ({
      id: p.id,
      date: p.paidDate,
      created: p.createdAt,
      kind: 'INGRESO' as const,
      concept: `Cobro ${p.invoice?.number ?? ''} · ${p.customer.firstName} ${p.customer.lastName}`.replace('  ', ' '),
      detail: p.reference ? `Ref. ${p.reference}` : '',
      account: p.account?.name ?? '—',
      amount: toNumber(p.amount),
      href: p.invoice ? `/dashboard/billing/${p.invoice.id}` : '/dashboard/payments',
    })),
    ...expenses.map((e) => ({
      id: e.id,
      date: e.date,
      created: e.createdAt,
      kind: 'EGRESO' as const,
      concept: `${e.category.name}: ${e.description}`,
      detail: [e.supplier, e.reference && `Ref. ${e.reference}`].filter(Boolean).join(' · '),
      account: e.account?.name ?? '—',
      amount: -toNumber(e.amount),
      href: '/dashboard/finance/expenses',
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime() || a.created.getTime() - b.created.getTime())

  let balance = 0
  return rows.map(({ created: _c, ...r }) => {
    balance = Math.round((balance + r.amount) * 100) / 100
    return { ...r, balance }
  })
}
