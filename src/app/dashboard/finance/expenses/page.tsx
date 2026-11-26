import Link from 'next/link'
import { FileImage } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { MonthNav } from '@/components/app/month-nav'
import { ActionButton } from '@/components/forms/action-form'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { formatCurrency, formatDate, toDateInput, toNumber } from '@/lib/format'
import { todayIn } from '@/lib/dates'
import { monthRange } from '@/lib/finance-period'
import { accountOptions } from '@/lib/payments'
import { createExpense, deleteExpense } from './actions'
import { ExpenseForm } from './forms'

export const metadata = { title: 'Gastos' }

export default async function ExpensesPage({ searchParams }: { searchParams: { month?: string; category?: string } }) {
  const user = await requireUser('expenses')
  const tz = user.tenant.timezone
  const currency = user.tenant.currency
  const period = monthRange(searchParams.month, tz)

  const [categories, accounts, expenses, byCategory] = await Promise.all([
    prisma.expenseCategory.findMany({ where: { tenantId: user.tenantId }, orderBy: { name: 'asc' } }),
    accountOptions(user.tenantId),
    prisma.expense.findMany({
      where: { tenantId: user.tenantId, date: { gte: period.start, lt: period.end }, ...(searchParams.category ? { categoryId: searchParams.category } : {}) },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true, date: true, description: true, supplier: true, reference: true, amount: true, receiptMime: true,
        category: { select: { name: true } }, account: { select: { name: true } }, createdBy: { select: { name: true } },
      },
    }),
    prisma.expense.groupBy({ by: ['categoryId'], where: { tenantId: user.tenantId, date: { gte: period.start, lt: period.end } }, _sum: { amount: true } }),
  ])
  const total = expenses.reduce((s, e) => s + toNumber(e.amount), 0)
  const catName = new Map(categories.map((c) => [c.id, c.name]))

  return (
    <div className="space-y-6">
      <PageHeader title="Gastos" description="Egresos de la empresa: proveedores, equipos, salarios, servicios…">
        <MonthNav basePath="/dashboard/finance/expenses" label={period.label} prev={period.prev} next={period.next} />
      </PageHeader>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Registrar gasto</CardTitle>
          </CardHeader>
          <CardContent>
            <ExpenseForm
              action={createExpense}
              today={toDateInput(todayIn(tz))}
              accounts={accounts}
              categories={categories.filter((c) => c.isActive).map((c) => ({ value: c.id, label: c.name }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base capitalize">Total de {period.label}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-3xl font-bold text-red-600">{formatCurrency(byCategory.reduce((s, c) => s + toNumber(c._sum.amount), 0), currency)}</div>
            <ul className="space-y-1 text-sm">
              {byCategory
                .sort((a, b) => toNumber(b._sum.amount) - toNumber(a._sum.amount))
                .map((c) => (
                  <li key={c.categoryId} className="flex justify-between gap-2">
                    <Link href={`/dashboard/finance/expenses?month=${period.key}&category=${c.categoryId}`} className="hover:underline">
                      {catName.get(c.categoryId)}
                    </Link>
                    <span className="font-medium">{formatCurrency(c._sum.amount, currency)}</span>
                  </li>
                ))}
              {byCategory.length === 0 && <li className="text-muted-foreground">Sin gastos este mes.</li>}
            </ul>
            <Link href="/dashboard/finance/expense-categories" className="text-xs text-blue-700 hover:underline">Administrar categorías</Link>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">
            Gastos {searchParams.category ? `· ${catName.get(searchParams.category) ?? ''}` : ''} ({expenses.length}) · {formatCurrency(total, currency)}
          </CardTitle>
          {searchParams.category && (
            <Link href={`/dashboard/finance/expenses?month=${period.key}`} className="text-sm text-blue-700 hover:underline">Quitar filtro</Link>
          )}
        </CardHeader>
        <CardContent>
          {expenses.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin gastos en este periodo.</p>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Categoría</th>
                    <th>Descripción</th>
                    <th>Proveedor / ref.</th>
                    <th>Pagado desde</th>
                    <th>Monto</th>
                    <th>Comprobante</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {expenses.map((e) => (
                    <tr key={e.id}>
                      <td>{formatDate(e.date)}</td>
                      <td>{e.category.name}</td>
                      <td className="max-w-xs whitespace-normal">
                        {e.description}
                        <div className="text-xs text-muted-foreground">{e.createdBy?.name}</div>
                      </td>
                      <td>
                        {e.supplier ?? '—'}
                        {e.reference && <div className="text-xs text-muted-foreground">{e.reference}</div>}
                      </td>
                      <td>{e.account?.name ?? '—'}</td>
                      <td className="font-semibold">{formatCurrency(e.amount, currency)}</td>
                      <td>
                        {e.receiptMime ? (
                          <a href={`/api/files/expense/${e.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-700 hover:underline">
                            <FileImage className="h-4 w-4" /> Ver
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="text-right">
                        <ActionButton action={deleteExpense} fields={{ id: e.id }} variant="ghost" size="sm" className="text-red-600" confirm="¿Eliminar este gasto?">
                          Eliminar
                        </ActionButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
