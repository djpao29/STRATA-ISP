import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { MonthNav } from '@/components/app/month-nav'
import { Breakdown, IncomeExpensesChart } from '@/components/dashboard/home/finance-charts'
import { requireUser } from '@/lib/session'
import { formatCurrency } from '@/lib/format'
import { monthRange } from '@/lib/finance-period'
import { accountingSummary, incomeVsExpenses } from '@/lib/accounting'

export const metadata = { title: 'Contabilidad' }

export default async function AccountingPage({ searchParams }: { searchParams: { month?: string } }) {
  const user = await requireUser('accounting')
  const currency = user.tenant.currency
  const period = monthRange(searchParams.month, user.tenant.timezone)
  const [s, series] = await Promise.all([accountingSummary(user.tenantId, period.start, period.end), incomeVsExpenses(user.tenantId, period.end)])

  return (
    <div className="space-y-6">
      <PageHeader title="Contabilidad" description="Resumen de caja: ingresos cobrados contra gastos pagados">
        <MonthNav basePath="/dashboard/finance/accounting" label={period.label} prev={period.prev} next={period.next} />
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Ingresos</div>
            <div className="text-3xl font-bold text-green-700">{formatCurrency(s.income, currency)}</div>
            <div className="text-xs text-muted-foreground">{s.incomeCount} pago(s) aprobados</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Gastos</div>
            <div className="text-3xl font-bold text-red-600">{formatCurrency(s.expenses, currency)}</div>
            <div className="text-xs text-muted-foreground">{s.expensesCount} gasto(s)</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Utilidad</div>
            <div className={`text-3xl font-bold ${s.profit >= 0 ? 'text-gray-900' : 'text-red-600'}`}>{formatCurrency(s.profit, currency)}</div>
            <div className="text-xs text-muted-foreground">{s.margin === null ? 'Sin ingresos en el periodo' : `Margen ${s.margin}%`}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Ingresos vs. gastos (12 meses)</CardTitle>
          <Link href={`/dashboard/finance/accounting/ledger?month=${period.key}`} className="text-sm text-blue-700 hover:underline">
            Ver libro de movimientos
          </Link>
        </CardHeader>
        <CardContent>
          <IncomeExpensesChart data={series} currency={currency} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ingresos por forma de pago</CardTitle>
          </CardHeader>
          <CardContent>
            <Breakdown rows={s.incomeByAccount} currency={currency} color="bg-green-500" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Gastos por categoría</CardTitle>
          </CardHeader>
          <CardContent>
            <Breakdown rows={s.expensesByCategory} currency={currency} color="bg-red-500" />
          </CardContent>
        </Card>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="table">
          <thead>
            <tr>
              <th>Mes</th>
              <th className="text-right">Ingresos</th>
              <th className="text-right">Gastos</th>
              <th className="text-right">Utilidad</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {[...series].reverse().map((r) => (
              <tr key={r.month}>
                <td>{r.month}</td>
                <td className="text-right text-green-700">{formatCurrency(r.ingresos, currency)}</td>
                <td className="text-right text-red-600">{formatCurrency(r.gastos, currency)}</td>
                <td className={`text-right font-medium ${r.utilidad < 0 ? 'text-red-600' : ''}`}>{formatCurrency(r.utilidad, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
