import Link from 'next/link'
import type { InvoiceStatus, Prisma } from '@prisma/client'
import { AlertTriangle, CheckCircle2, Clock, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { DataTable } from '@/components/app/data-table'
import { StatusBadge } from '@/components/app/status-badge'
import { StatCard, StatGrid } from '@/components/app/stat-card'
import { PAGE_SIZE, Pagination, SearchBar, param, parsePage } from '@/components/app/list-controls'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { markOverdueInvoices } from '@/lib/billing'
import { currentPeriodIn, monthStartIn } from '@/lib/dates'
import { formatCurrency, formatDate } from '@/lib/format'
import { invoiceStatusOptions } from '@/lib/labels'
import { generateInvoices } from './actions'
import { GenerateInvoicesForm } from './forms'

export const metadata = { title: 'Facturación' }

type Props = { searchParams: Record<string, string | string[] | undefined> }

export default async function BillingPage({ searchParams }: Props) {
  const user = await requireUser('billing')
  await markOverdueInvoices(user.tenantId)

  const q = param(searchParams.q)
  const status = param(searchParams.status) as InvoiceStatus | undefined
  const page = parsePage(searchParams.page)
  const currency = user.tenant.currency

  const where: Prisma.InvoiceWhereInput = {
    tenantId: user.tenantId,
    ...(status && invoiceStatusOptions.some((o) => o.value === status) ? { status } : {}),
    ...(q
      ? {
          OR: [
            { number: { contains: q, mode: 'insensitive' } },
            { customer: { firstName: { contains: q, mode: 'insensitive' } } },
            { customer: { lastName: { contains: q, mode: 'insensitive' } } },
            { customer: { cedula: { contains: q } } },
          ],
        }
      : {}),
  }

  const monthStart = monthStartIn(user.tenant.timezone)

  const [invoices, total, pending, overdue, collected] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: [{ issueDate: 'desc' }, { number: 'desc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { customer: { select: { firstName: true, lastName: true } } },
    }),
    prisma.invoice.count({ where }),
    prisma.invoice.aggregate({ where: { tenantId: user.tenantId, status: 'PENDING' }, _sum: { amount: true }, _count: true }),
    prisma.invoice.aggregate({ where: { tenantId: user.tenantId, status: 'OVERDUE' }, _sum: { amount: true }, _count: true }),
    prisma.payment.aggregate({
      where: { tenantId: user.tenantId, status: 'APPROVED', paidDate: { gte: monthStart } },
      _sum: { amount: true },
    }),
  ])

  const defaultPeriod = currentPeriodIn(user.tenant.timezone)

  return (
    <div className="space-y-6">
      <PageHeader title="Facturación" description="Facturas emitidas a los clientes">
        <Button asChild>
          <Link href="/dashboard/billing/new">
            <Plus className="mr-2 h-4 w-4" />
            Nueva factura
          </Link>
        </Button>
      </PageHeader>

      <StatGrid>
        <StatCard title="Por cobrar" value={formatCurrency(pending._sum.amount, currency)} hint={`${pending._count} facturas pendientes`} icon={Clock} />
        <StatCard title="Vencido" value={formatCurrency(overdue._sum.amount, currency)} hint={`${overdue._count} facturas vencidas`} icon={AlertTriangle} />
        <StatCard title="Cobrado este mes" value={formatCurrency(collected._sum.amount, currency)} hint="Pagos aprobados" icon={CheckCircle2} />
      </StatGrid>

      <Card>
        <CardHeader>
          <CardTitle>Facturación mensual</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Crea una factura por cada servicio activo de los clientes activos, con el precio actual del plan. Si un servicio ya
            tiene la factura de ese mes, no se duplica.
          </p>
          <GenerateInvoicesForm action={generateInvoices} defaultPeriod={defaultPeriod} />
        </CardContent>
      </Card>

      <SearchBar q={q} status={status} placeholder="Buscar por número, cliente o cédula" statusOptions={invoiceStatusOptions} />

      <DataTable
        headers={['Número', 'Cliente', 'Concepto', 'Emisión', 'Vence', 'Monto', 'Estado']}
        rowCount={invoices.length}
        emptyText={q || status ? 'Ninguna factura coincide con el filtro.' : 'Todavía no hay facturas.'}
      >
        {invoices.map((i) => (
          <tr key={i.id}>
            <td>
              <Link href={`/dashboard/billing/${i.id}`} className="font-medium text-blue-700 hover:underline">
                {i.number}
              </Link>
            </td>
            <td>
              <Link href={`/dashboard/customers/${i.customerId}`} className="hover:underline">
                {i.customer.firstName} {i.customer.lastName}
              </Link>
            </td>
            <td className="max-w-xs truncate">{i.description}</td>
            <td>{formatDate(i.issueDate)}</td>
            <td>{formatDate(i.dueDate)}</td>
            <td>{formatCurrency(i.amount, currency)}</td>
            <td>
              <StatusBadge value={i.status} />
            </td>
          </tr>
        ))}
      </DataTable>

      <Pagination page={page} total={total} basePath="/dashboard/billing" params={{ q, status }} />
    </div>
  )
}
