import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { StatusBadge } from '@/components/app/status-badge'
import { param } from '@/components/app/list-controls'
import { Button } from '@/components/ui/button'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { formatCurrency, formatDate } from '@/lib/format'
import { AGING_LABEL, pendingByCustomer } from '@/lib/collections'
import { formatCustomerCode } from '@/lib/zones/billing'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Pagos pendientes' }

const BUCKET_COLOR = {
  AL_DIA: 'bg-gray-100 text-gray-700',
  D1_30: 'bg-yellow-100 text-yellow-800',
  D31_60: 'bg-orange-100 text-orange-800',
  D61_90: 'bg-red-100 text-red-800',
  D90: 'bg-red-200 text-red-900',
} as const

type Props = { searchParams: Record<string, string | string[] | undefined> }

export default async function PendingPaymentsPage({ searchParams }: Props) {
  const user = await requireUser('finance')
  const currency = user.tenant.currency
  const q = param(searchParams.q)?.toLowerCase()
  const zone = param(searchParams.zone)
  const bucket = param(searchParams.aging)

  const [all, zones] = await Promise.all([
    pendingByCustomer(user.tenantId, user.tenant.timezone),
    prisma.zone.findMany({ where: { tenantId: user.tenantId }, orderBy: { invoiceDay: 'asc' }, select: { id: true, name: true } }),
  ])
  let rows = all
  if (q) rows = rows.filter((r) => [r.name, r.phone, formatCustomerCode(r.code), r.oldestNumber].some((v) => v.toLowerCase().includes(q)))
  if (zone) rows = rows.filter((r) => (zone === 'none' ? !r.zone : r.zone?.id === zone))
  if (bucket && bucket in AGING_LABEL) rows = rows.filter((r) => r.bucket === bucket)
  rows.sort((a, b) => b.daysLate - a.daysLate || b.balance - a.balance)

  const total = rows.reduce((s, r) => s + r.balance, 0)

  return (
    <div className="space-y-6">
      <PageHeader title="Pagos pendientes" description="Clientes con saldo por cobrar, ordenados por antigüedad de la deuda" />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {(Object.keys(AGING_LABEL) as Array<keyof typeof AGING_LABEL>).map((b) => {
          const list = all.filter((r) => r.bucket === b)
          return (
            <Link
              key={b}
              href={`/dashboard/finance/pending?aging=${b}`}
              className={cn('rounded-lg border bg-white p-3 shadow-sm hover:shadow-md', bucket === b && 'ring-2 ring-blue-500')}
            >
              <div className="text-xs text-muted-foreground">{AGING_LABEL[b]}</div>
              <div className="text-lg font-bold">{formatCurrency(list.reduce((s, r) => s + r.balance, 0), currency)}</div>
              <div className="text-xs text-muted-foreground">{list.length} cliente(s)</div>
            </Link>
          )
        })}
      </div>

      <form className="flex flex-col gap-2 sm:flex-row" role="search">
        <input
          name="q"
          defaultValue={param(searchParams.q)}
          placeholder="Buscar por código, nombre, teléfono o factura"
          className="flex h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm"
        />
        <select name="zone" defaultValue={zone ?? ''} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
          <option value="">Todas las zonas</option>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>{z.name}</option>
          ))}
          <option value="none">Sin zona</option>
        </select>
        <select name="aging" defaultValue={bucket ?? ''} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
          <option value="">Toda antigüedad</option>
          {Object.entries(AGING_LABEL).map(([k, l]) => (
            <option key={k} value={k}>{l}</option>
          ))}
        </select>
        <Button type="submit" variant="secondary">Filtrar</Button>
      </form>

      <p className="text-sm">
        {rows.length} cliente(s) · total por cobrar <strong>{formatCurrency(total, currency)}</strong>
      </p>

      <Card>
        <CardContent className="pt-6">
          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {all.length === 0 ? 'No hay pagos pendientes. Todos los clientes están al día.' : 'Ningún cliente coincide con el filtro.'}
            </p>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Zona</th>
                    <th>Facturas</th>
                    <th>Saldo</th>
                    <th>Vence (más antigua)</th>
                    <th>Atraso</th>
                    <th>Corte</th>
                    <th>Servicio</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <Link href={`/dashboard/customers/${r.id}`} className="font-medium text-blue-700 hover:underline">{r.name}</Link>
                        <div className="text-xs text-muted-foreground">{formatCustomerCode(r.code)} · {r.phone}</div>
                      </td>
                      <td>{r.zone?.name ?? <span className="text-amber-700">Sin zona</span>}</td>
                      <td>{r.invoices}</td>
                      <td className="font-semibold">{formatCurrency(r.balance, currency)}</td>
                      <td>
                        {formatDate(r.oldestDue)}
                        <div className="text-xs text-muted-foreground">{r.oldestNumber}</div>
                      </td>
                      <td>
                        <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', BUCKET_COLOR[r.bucket])}>
                          {r.daysLate > 0 ? `${r.daysLate} día(s)` : 'Por vencer'}
                        </span>
                      </td>
                      <td>
                        {r.promise ? (
                          <span className="text-xs text-blue-700">Promesa hasta {formatDate(r.promise.promisedDate)}</span>
                        ) : r.nextCut ? (
                          formatDate(r.nextCut)
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        <StatusBadge value={r.status} />
                      </td>
                      <td className="space-x-1 whitespace-nowrap text-right">
                        <Button asChild size="sm">
                          <Link href={`/dashboard/billing/${r.oldestInvoiceId}`}>Cobrar</Link>
                        </Button>
                        {!r.promise && (
                          <Button asChild size="sm" variant="outline">
                            <Link href="/dashboard/finance/promises">Promesa</Link>
                          </Button>
                        )}
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
