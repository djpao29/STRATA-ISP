import Link from 'next/link'
import { FileImage } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { ActionButton } from '@/components/forms/action-form'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { formatCurrency, formatDate, formatDateTime, toDateInput, toNumber } from '@/lib/format'
import { todayIn } from '@/lib/dates'
import { accountOptions } from '@/lib/payments'
import { reviewPayment } from '../../payments/actions'
import { submitPaymentReport } from '../actions'
import { PaymentReportForm, RejectForm } from '../forms'

export const metadata = { title: 'Reporte de pagos' }

export default async function PaymentReportsPage() {
  const user = await requireUser('payments')
  const currency = user.tenant.currency
  const tz = user.tenant.timezone

  const [pending, recent, invoices, accounts] = await Promise.all([
    prisma.payment.findMany({
      where: { tenantId: user.tenantId, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      include: {
        customer: { select: { id: true, firstName: true, lastName: true } },
        invoice: { select: { id: true, number: true, amount: true } },
        account: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
    }),
    prisma.payment.findMany({
      where: { tenantId: user.tenantId, source: 'REPORT', status: { not: 'PENDING' } },
      orderBy: { reviewedAt: 'desc' },
      take: 15,
      include: { customer: { select: { firstName: true, lastName: true } }, reviewedBy: { select: { name: true } } },
    }),
    prisma.invoice.findMany({
      where: { tenantId: user.tenantId, status: { in: ['PENDING', 'OVERDUE'] } },
      orderBy: { dueDate: 'asc' },
      include: {
        customer: { select: { firstName: true, lastName: true } },
        payments: { where: { status: 'APPROVED' }, select: { amount: true } },
      },
    }),
    accountOptions(user.tenantId),
  ])

  const invoiceOptions = invoices.map((i) => {
    const balance = toNumber(i.amount) - i.payments.reduce((s, p) => s + toNumber(p.amount), 0)
    return {
      value: i.id,
      label: `${i.number} · ${i.customer.firstName} ${i.customer.lastName} · saldo ${formatCurrency(balance, currency)}`,
      balance: balance.toFixed(2),
    }
  })

  return (
    <div className="space-y-6">
      <PageHeader title="Reporte de pagos" description="Pagos informados por los clientes (transferencia, depósito…) pendientes de revisar" />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Por revisar ({pending.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin reportes por revisar.</p>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Recibido</th>
                    <th>Cliente</th>
                    <th>Factura</th>
                    <th>Monto</th>
                    <th>Pagó en</th>
                    <th>Referencia</th>
                    <th>Comprobante</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {pending.map((p) => (
                    <tr key={p.id}>
                      <td>
                        {formatDateTime(p.createdAt, tz)}
                        <div className="text-xs text-muted-foreground">pagó el {formatDate(p.paidDate)}</div>
                      </td>
                      <td>
                        <Link href={`/dashboard/customers/${p.customer.id}`} className="text-blue-700 hover:underline">
                          {p.customer.firstName} {p.customer.lastName}
                        </Link>
                      </td>
                      <td>
                        {p.invoice ? (
                          <Link href={`/dashboard/billing/${p.invoice.id}`} className="hover:underline">{p.invoice.number}</Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="font-semibold">{formatCurrency(p.amount, currency)}</td>
                      <td>{p.account?.name ?? '—'}</td>
                      <td>{p.reference ?? '—'}</td>
                      <td>
                        {p.receiptMime ? (
                          <a href={`/api/files/payment/${p.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-700 hover:underline">
                            <FileImage className="h-4 w-4" /> Ver
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">Sin archivo</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1">
                          <ActionButton action={reviewPayment} fields={{ id: p.id, decision: 'APPROVED' }} size="sm" confirm="¿Aprobar este pago? Se aplicará a la factura.">
                            Aprobar
                          </ActionButton>
                          <RejectForm action={reviewPayment} id={p.id} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Registrar un reporte de pago</CardTitle>
        </CardHeader>
        <CardContent>
          {invoiceOptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay facturas pendientes.</p>
          ) : (
            <PaymentReportForm action={submitPaymentReport} invoices={invoiceOptions} accounts={accounts} today={toDateInput(todayIn(tz))} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Últimos reportes revisados</CardTitle>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no hay reportes revisados.</p>
          ) : (
            <ul className="divide-y text-sm">
              {recent.map((p) => (
                <li key={p.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>
                    {p.customer.firstName} {p.customer.lastName} · {formatCurrency(p.amount, currency)} ·{' '}
                    <span className={p.status === 'APPROVED' ? 'font-medium text-green-700' : 'font-medium text-red-600'}>
                      {p.status === 'APPROVED' ? 'Aprobado' : 'Rechazado'}
                    </span>
                    {p.rejectReason && <span className="text-muted-foreground"> — {p.rejectReason}</span>}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {p.reviewedBy?.name ?? '—'} · {formatDateTime(p.reviewedAt, tz)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
