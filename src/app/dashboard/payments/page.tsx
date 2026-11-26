import Link from 'next/link'
import type { PaymentStatus, Prisma } from '@prisma/client'
import { PageHeader } from '@/components/app/page-header'
import { DataTable } from '@/components/app/data-table'
import { StatusBadge } from '@/components/app/status-badge'
import { PAGE_SIZE, Pagination, SearchBar, param, parsePage } from '@/components/app/list-controls'
import { ActionButton } from '@/components/forms/action-form'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { formatCurrency, formatDate } from '@/lib/format'
import { PAYMENT_METHOD } from '@/lib/labels'
import { reviewPayment } from './actions'

export const metadata = { title: 'Pagos' }

const statusOptions = [
  { value: 'PENDING', label: 'Pendiente de revisión' },
  { value: 'APPROVED', label: 'Aprobado' },
  { value: 'REJECTED', label: 'Rechazado' },
]

type Props = { searchParams: Record<string, string | string[] | undefined> }

export default async function PaymentsPage({ searchParams }: Props) {
  const user = await requireUser('payments')
  const q = param(searchParams.q)
  const status = param(searchParams.status) as PaymentStatus | undefined
  const page = parsePage(searchParams.page)
  const currency = user.tenant.currency

  const where: Prisma.PaymentWhereInput = {
    tenantId: user.tenantId,
    ...(status && statusOptions.some((o) => o.value === status) ? { status } : {}),
    ...(q
      ? {
          OR: [
            { reference: { contains: q, mode: 'insensitive' } },
            { invoice: { number: { contains: q, mode: 'insensitive' } } },
            { customer: { firstName: { contains: q, mode: 'insensitive' } } },
            { customer: { lastName: { contains: q, mode: 'insensitive' } } },
            { customer: { cedula: { contains: q } } },
          ],
        }
      : {}),
  }

  const [payments, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: [{ paidDate: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        customer: { select: { id: true, firstName: true, lastName: true } },
        invoice: { select: { id: true, number: true } },
        createdBy: { select: { name: true } },
      },
    }),
    prisma.payment.count({ where }),
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pagos"
        description="Los pagos se registran desde la factura correspondiente. Aquí se consultan y revisan."
      />

      <SearchBar q={q} status={status} placeholder="Buscar por cliente, cédula, factura o referencia" statusOptions={statusOptions} />

      <DataTable
        headers={['Fecha', 'Cliente', 'Factura', 'Monto', 'Método', 'Referencia', 'Registrado por', 'Estado', '']}
        rowCount={payments.length}
        emptyText={q || status ? 'Ningún pago coincide con el filtro.' : 'Todavía no hay pagos registrados.'}
      >
        {payments.map((p) => (
          <tr key={p.id}>
            <td>{formatDate(p.paidDate)}</td>
            <td>
              <Link href={`/dashboard/customers/${p.customer.id}`} className="hover:underline">
                {p.customer.firstName} {p.customer.lastName}
              </Link>
            </td>
            <td>
              {p.invoice ? (
                <Link href={`/dashboard/billing/${p.invoice.id}`} className="text-blue-700 hover:underline">
                  {p.invoice.number}
                </Link>
              ) : (
                '—'
              )}
            </td>
            <td className="font-medium">{formatCurrency(p.amount, currency)}</td>
            <td>{PAYMENT_METHOD[p.method]}</td>
            <td>{p.reference ?? '—'}</td>
            <td>{p.createdBy?.name ?? '—'}</td>
            <td>
              <StatusBadge value={p.status} />
            </td>
            <td className="space-x-1 whitespace-nowrap text-right">
              {p.status !== 'APPROVED' && (
                <ActionButton action={reviewPayment} fields={{ id: p.id, decision: 'APPROVED' }} variant="outline" size="sm">
                  Aprobar
                </ActionButton>
              )}
              {p.status !== 'REJECTED' && (
                <ActionButton
                  action={reviewPayment}
                  fields={{ id: p.id, decision: 'REJECTED' }}
                  variant="ghost"
                  size="sm"
                  className="text-red-600"
                  confirm="¿Rechazar este pago?"
                >
                  Rechazar
                </ActionButton>
              )}
            </td>
          </tr>
        ))}
      </DataTable>

      <Pagination page={page} total={total} basePath="/dashboard/payments" params={{ q, status }} />
    </div>
  )
}
