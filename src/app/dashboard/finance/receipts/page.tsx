import Link from 'next/link'
import { FileText } from 'lucide-react'
import type { PaymentStatus, Prisma } from '@prisma/client'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { StatusBadge } from '@/components/app/status-badge'
import { PAGE_SIZE, Pagination, SearchBar, param, parsePage } from '@/components/app/list-controls'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { formatCurrency, formatDate } from '@/lib/format'
import { isImage } from '@/lib/uploads'

export const metadata = { title: 'Comprobantes de pago' }

const statusOptions = [
  { value: 'PENDING', label: 'Por revisar' },
  { value: 'APPROVED', label: 'Aprobado' },
  { value: 'REJECTED', label: 'Rechazado' },
]

type Props = { searchParams: Record<string, string | string[] | undefined> }

export default async function ReceiptsPage({ searchParams }: Props) {
  const user = await requireUser('payments')
  const q = param(searchParams.q)
  const status = param(searchParams.status) as PaymentStatus | undefined
  const page = parsePage(searchParams.page)

  const where: Prisma.PaymentWhereInput = {
    tenantId: user.tenantId,
    receiptMime: { not: null },
    ...(status && statusOptions.some((o) => o.value === status) ? { status } : {}),
    ...(q
      ? {
          OR: [
            { reference: { contains: q, mode: 'insensitive' } },
            { customer: { firstName: { contains: q, mode: 'insensitive' } } },
            { customer: { lastName: { contains: q, mode: 'insensitive' } } },
            { invoice: { number: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  }

  // Sin traer los archivos: solo los datos para la galería.
  const [receipts, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        amount: true,
        paidDate: true,
        status: true,
        reference: true,
        receiptMime: true,
        receiptName: true,
        customer: { select: { id: true, firstName: true, lastName: true } },
        invoice: { select: { id: true, number: true } },
        account: { select: { name: true } },
      },
    }),
    prisma.payment.count({ where }),
  ])

  return (
    <div className="space-y-6">
      <PageHeader title="Comprobantes de pago" description="Fotos y PDF adjuntos a los pagos. Se adjuntan al registrar un pago o un reporte de pago." />
      <SearchBar q={q} status={status} placeholder="Buscar por cliente, factura o referencia" statusOptions={statusOptions} />

      {receipts.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No hay comprobantes{q || status ? ' que coincidan con el filtro' : ''}. Adjúntalos desde la factura o desde{' '}
            <Link href="/dashboard/finance/payment-reports" className="text-blue-700 underline">Reporte de pagos</Link>.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
          {receipts.map((r) => (
            <Card key={r.id} className="overflow-hidden">
              <a href={`/api/files/payment/${r.id}`} target="_blank" rel="noreferrer" className="block h-40 bg-gray-100">
                {isImage(r.receiptMime) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/files/payment/${r.id}`} alt={`Comprobante de ${r.customer.firstName}`} className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <span className="flex h-full flex-col items-center justify-center gap-1 text-sm text-muted-foreground">
                    <FileText className="h-10 w-10" /> PDF
                  </span>
                )}
              </a>
              <CardContent className="space-y-1 p-3 text-xs">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-sm font-semibold">{formatCurrency(r.amount, user.tenant.currency)}</span>
                  <StatusBadge value={r.status} />
                </div>
                <Link href={`/dashboard/customers/${r.customer.id}`} className="block truncate text-blue-700 hover:underline">
                  {r.customer.firstName} {r.customer.lastName}
                </Link>
                <div className="truncate text-muted-foreground">
                  {formatDate(r.paidDate)} · {r.invoice?.number ?? 'sin factura'} · {r.account?.name ?? '—'}
                </div>
                {r.reference && <div className="truncate text-muted-foreground">Ref. {r.reference}</div>}
                <a href={`/api/files/payment/${r.id}?download=1`} className="text-blue-700 hover:underline">
                  Descargar
                </a>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <Pagination page={page} total={total} basePath="/dashboard/finance/receipts" params={{ q, status }} />
    </div>
  )
}
