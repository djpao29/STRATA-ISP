import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { DataTable } from '@/components/app/data-table'
import { StatusBadge } from '@/components/app/status-badge'
import { ActionButton } from '@/components/forms/action-form'
import { PrintButton } from '@/components/app/print-button'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { formatCurrency, formatDate, formatDateTime, toDateInput, toNumber } from '@/lib/format'
import { PAYMENT_METHOD } from '@/lib/labels'
import { todayIn } from '@/lib/dates'
import { accountOptions } from '@/lib/payments'
import { reviewPayment } from '../../payments/actions'
import { cancelInvoice, registerPayment } from '../actions'
import { PaymentForm } from '../forms'

export default async function InvoiceDetailPage({ params }: { params: { id: string } }) {
  const user = await requireUser('billing')
  const invoice = await prisma.invoice.findFirst({
    where: { id: params.id, tenantId: user.tenantId },
    include: {
      customer: true,
      tenant: true,
      service: { include: { plan: { select: { name: true } } } },
      payments: { orderBy: { paidDate: 'desc' }, include: { createdBy: { select: { name: true } } } },
    },
  })
  if (!invoice) notFound()

  const currency = invoice.tenant.currency
  const accounts = await accountOptions(user.tenantId)
  const paid = invoice.payments.filter((p) => p.status === 'APPROVED').reduce((sum, p) => sum + toNumber(p.amount), 0)
  const remaining = Math.max(0, Math.round((toNumber(invoice.amount) - paid) * 100) / 100)
  const open = invoice.status === 'PENDING' || invoice.status === 'OVERDUE'

  return (
    <div className="space-y-6">
      <PageHeader title={`Factura ${invoice.number}`} description={invoice.description}>
        <PrintButton />
        {open && paid === 0 && (
          <ActionButton
            action={cancelInvoice}
            fields={{ id: invoice.id }}
            variant="outline"
            className="text-red-600"
            confirm="¿Anular esta factura? No se puede deshacer."
          >
            Anular
          </ActionButton>
        )}
      </PageHeader>

      <Card className="print:border-0 print:shadow-none">
        <CardContent className="space-y-6 pt-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row">
            <div>
              <div className="text-lg font-bold">{invoice.tenant.name}</div>
              {invoice.tenant.taxId && <div className="text-sm">RUC {invoice.tenant.taxId}</div>}
              {invoice.tenant.address && <div className="text-sm text-muted-foreground">{invoice.tenant.address}</div>}
              {invoice.tenant.phone && <div className="text-sm text-muted-foreground">{invoice.tenant.phone}</div>}
            </div>
            <div className="text-sm sm:text-right">
              <div className="text-lg font-bold">{invoice.number}</div>
              <div>Emisión: {formatDate(invoice.issueDate)}</div>
              <div>Vence: {formatDate(invoice.dueDate)}</div>
              <div className="mt-1">
                <StatusBadge value={invoice.status} />
              </div>
            </div>
          </div>

          <div className="text-sm">
            <div className="text-muted-foreground">Cliente</div>
            <Link href={`/dashboard/customers/${invoice.customerId}`} className="font-medium hover:underline">
              {invoice.customer.firstName} {invoice.customer.lastName}
            </Link>
            {invoice.customer.cedula && <div>Cédula/RUC {invoice.customer.cedula}</div>}
            {invoice.customer.address && <div>{invoice.customer.address}</div>}
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2">Concepto</th>
                <th className="py-2 text-right">Importe</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-2">{invoice.description}</td>
                <td className="py-2 text-right">{formatCurrency(invoice.amount, currency)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td className="py-2 text-right font-medium">Total</td>
                <td className="py-2 text-right font-bold">{formatCurrency(invoice.amount, currency)}</td>
              </tr>
              <tr>
                <td className="py-1 text-right text-muted-foreground">Pagado</td>
                <td className="py-1 text-right">{formatCurrency(paid, currency)}</td>
              </tr>
              <tr>
                <td className="py-1 text-right text-muted-foreground">Saldo</td>
                <td className="py-1 text-right font-semibold">{formatCurrency(remaining, currency)}</td>
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>

      {open && remaining > 0 && (
        <Card className="print:hidden">
          <CardHeader>
            <CardTitle>Registrar pago</CardTitle>
          </CardHeader>
          <CardContent>
            <PaymentForm
              action={registerPayment.bind(null, invoice.id)}
              remaining={remaining.toFixed(2)}
              today={toDateInput(todayIn(invoice.tenant.timezone))}
              accounts={accounts}
            />
          </CardContent>
        </Card>
      )}

      <div className="print:hidden">
        <DataTable
          title="Pagos"
          headers={['Fecha', 'Monto', 'Método', 'Referencia', 'Registrado por', 'Estado', '']}
          rowCount={invoice.payments.length}
          emptyText="Sin pagos registrados."
        >
          {invoice.payments.map((p) => (
            <tr key={p.id}>
              <td>{formatDate(p.paidDate)}</td>
              <td>{formatCurrency(p.amount, currency)}</td>
              <td>{PAYMENT_METHOD[p.method]}</td>
              <td>{p.reference ?? '—'}</td>
              <td>
                {p.createdBy?.name ?? '—'}
                <div className="text-xs text-muted-foreground">{formatDateTime(p.createdAt)}</div>
              </td>
              <td>
                <StatusBadge value={p.status} />
              </td>
              <td className="text-right">
                {p.status !== 'REJECTED' && (
                  <ActionButton
                    action={reviewPayment}
                    fields={{ id: p.id, decision: 'REJECTED' }}
                    variant="ghost"
                    size="sm"
                    className="text-red-600"
                    confirm="¿Rechazar este pago? La factura volverá a quedar con saldo pendiente."
                  >
                    Rechazar
                  </ActionButton>
                )}
              </td>
            </tr>
          ))}
        </DataTable>
      </div>
    </div>
  )
}
