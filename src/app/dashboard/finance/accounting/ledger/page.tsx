import Link from 'next/link'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { MonthNav } from '@/components/app/month-nav'
import { requireUser } from '@/lib/session'
import { formatCurrency, formatDate } from '@/lib/format'
import { monthRange } from '@/lib/finance-period'
import { ledger } from '@/lib/accounting'

export const metadata = { title: 'Libro de movimientos' }

export default async function LedgerPage({ searchParams }: { searchParams: { month?: string } }) {
  const user = await requireUser('accounting')
  const currency = user.tenant.currency
  const period = monthRange(searchParams.month, user.tenant.timezone)
  const rows = await ledger(user.tenantId, period.start, period.end)
  const income = rows.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0)
  const expenses = rows.filter((r) => r.amount < 0).reduce((s, r) => s - r.amount, 0)

  return (
    <div className="space-y-6">
      <PageHeader title="Libro de movimientos" description="Todos los ingresos (pagos aprobados) y egresos (gastos) del mes, con saldo acumulado">
        <MonthNav basePath="/dashboard/finance/accounting/ledger" label={period.label} prev={period.prev} next={period.next} />
        <Button asChild variant="outline">
          <a href={`/api/export?type=ledger&month=${period.key}`}>
            <Download className="mr-2 h-4 w-4" />
            Exportar CSV
          </a>
        </Button>
      </PageHeader>

      <div className="flex flex-wrap gap-6 text-sm">
        <span>Ingresos: <strong className="text-green-700">{formatCurrency(income, currency)}</strong></span>
        <span>Egresos: <strong className="text-red-600">{formatCurrency(expenses, currency)}</strong></span>
        <span>Resultado: <strong>{formatCurrency(income - expenses, currency)}</strong></span>
      </div>

      <Card>
        <CardContent className="pt-6">
          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Sin movimientos en {period.label}.</p>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Tipo</th>
                    <th>Concepto</th>
                    <th>Cuenta</th>
                    <th className="text-right">Ingreso</th>
                    <th className="text-right">Egreso</th>
                    <th className="text-right">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {rows.map((r) => (
                    <tr key={`${r.kind}-${r.id}`}>
                      <td>{formatDate(r.date)}</td>
                      <td>
                        <span className={r.kind === 'INGRESO' ? 'text-xs font-semibold text-green-700' : 'text-xs font-semibold text-red-600'}>
                          {r.kind === 'INGRESO' ? 'Ingreso' : 'Egreso'}
                        </span>
                      </td>
                      <td className="max-w-md whitespace-normal">
                        <Link href={r.href} className="hover:underline">{r.concept}</Link>
                        {r.detail && <div className="text-xs text-muted-foreground">{r.detail}</div>}
                      </td>
                      <td>{r.account}</td>
                      <td className="text-right text-green-700">{r.amount > 0 ? formatCurrency(r.amount, currency) : ''}</td>
                      <td className="text-right text-red-600">{r.amount < 0 ? formatCurrency(-r.amount, currency) : ''}</td>
                      <td className={`text-right font-medium ${r.balance < 0 ? 'text-red-600' : ''}`}>{formatCurrency(r.balance, currency)}</td>
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
