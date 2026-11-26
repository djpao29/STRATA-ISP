import Link from 'next/link'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { DataTable } from '@/components/app/data-table'
import { StatusBadge } from '@/components/app/status-badge'
import { RevenueChart } from '@/components/dashboard/revenue-chart'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { markOverdueInvoices } from '@/lib/billing'
import { monthlyRevenue, topDebtors } from '@/lib/reports'
import { formatCurrency } from '@/lib/format'
import { CUSTOMER_STATUS, INVOICE_STATUS, TICKET_STATUS } from '@/lib/labels'

export const metadata = { title: 'Reportes' }

export default async function ReportsPage() {
  const user = await requireUser('reports')
  await markOverdueInvoices(user.tenantId)
  const currency = user.tenant.currency

  const [revenue, debtors, customersByStatus, invoicesByStatus, ticketsByStatus] = await Promise.all([
    monthlyRevenue(user.tenantId, user.tenant.timezone),
    topDebtors(user.tenantId),
    prisma.customer.groupBy({ by: ['status'], where: { tenantId: user.tenantId }, _count: { _all: true } }),
    prisma.invoice.groupBy({ by: ['status'], where: { tenantId: user.tenantId }, _count: { _all: true }, _sum: { amount: true } }),
    prisma.ticket.groupBy({ by: ['status'], where: { tenantId: user.tenantId }, _count: { _all: true } }),
  ])

  return (
    <div className="space-y-6">
      <PageHeader title="Reportes" description="Resumen financiero y operativo">
        <Button asChild variant="outline">
          <a href="/api/export?type=invoices">
            <Download className="mr-2 h-4 w-4" />
            Facturas (CSV)
          </a>
        </Button>
        <Button asChild variant="outline">
          <a href="/api/export?type=payments">
            <Download className="mr-2 h-4 w-4" />
            Pagos (CSV)
          </a>
        </Button>
        <Button asChild variant="outline">
          <a href="/api/export?type=customers">
            <Download className="mr-2 h-4 w-4" />
            Clientes (CSV)
          </a>
        </Button>
      </PageHeader>

      <RevenueChart data={revenue} currency={currency} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Summary title="Clientes por estado" rows={customersByStatus.map((r) => [CUSTOMER_STATUS[r.status], String(r._count._all)])} />
        <Summary
          title="Facturas por estado"
          rows={invoicesByStatus.map((r) => [
            INVOICE_STATUS[r.status],
            `${r._count._all} · ${formatCurrency(r._sum.amount, currency)}`,
          ])}
        />
        <Summary title="Tickets por estado" rows={ticketsByStatus.map((r) => [TICKET_STATUS[r.status], String(r._count._all)])} />
      </div>

      <DataTable
        title="Clientes con mayor deuda"
        headers={['Cliente', 'Teléfono', 'Estado', 'Facturas impagas', 'Saldo']}
        rowCount={debtors.length}
        emptyText="No hay saldos pendientes."
      >
        {debtors.map((d) => (
          <tr key={d.customer.id}>
            <td>
              <Link href={`/dashboard/customers/${d.customer.id}`} className="font-medium text-blue-700 hover:underline">
                {d.customer.firstName} {d.customer.lastName}
              </Link>
            </td>
            <td>{d.customer.phone}</td>
            <td>
              <StatusBadge value={d.customer.status} />
            </td>
            <td>{d.invoices}</td>
            <td className="font-semibold">{formatCurrency(d.amount, currency)}</td>
          </tr>
        ))}
      </DataTable>
    </div>
  )
}

function Summary({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin datos.</p>
        ) : (
          <dl className="space-y-2 text-sm">
            {rows.map(([label, value]) => (
              <div key={label} className="flex justify-between">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  )
}
