import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { PrintButton } from '@/components/app/print-button'
import { ActionButton } from '@/components/forms/action-form'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { can } from '@/lib/permissions'
import { formatCurrency, formatDate, toDateInput, toNumber } from '@/lib/format'
import { addDays } from '@/lib/billing-rules'
import { todayIn } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { convertProforma, deleteProforma, setProformaStatus } from '../actions'
import { ConvertForm } from '../proforma-form'
import { PROFORMA_STATUS } from '../status'

export default async function ProformaPage({ params }: { params: { id: string } }) {
  const user = await requireUser('finance')
  const p = await prisma.proforma.findFirst({
    where: { id: params.id, tenantId: user.tenantId },
    include: { items: { orderBy: { sortOrder: 'asc' } }, customer: true, tenant: true, invoice: { select: { id: true, number: true } } },
  })
  if (!p) notFound()
  const currency = p.tenant.currency
  const customers = p.customerId
    ? []
    : await prisma.customer.findMany({
        where: { tenantId: user.tenantId, status: { not: 'CANCELLED' } },
        orderBy: [{ lastName: 'asc' }],
        select: { id: true, firstName: true, lastName: true, cedula: true },
      })

  return (
    <div className="space-y-6">
      <PageHeader title={`Proforma ${p.number}`} description="Documento sin valor fiscal">
        <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', PROFORMA_STATUS[p.status][1])}>{PROFORMA_STATUS[p.status][0]}</span>
        <PrintButton />
        {p.status !== 'INVOICED' &&
          (['SENT', 'ACCEPTED', 'REJECTED'] as const)
            .filter((s) => s !== p.status)
            .map((s) => (
              <ActionButton key={s} action={setProformaStatus} fields={{ id: p.id, status: s }} variant="outline" size="sm" className="print:hidden">
                Marcar {PROFORMA_STATUS[s][0].toLowerCase()}
              </ActionButton>
            ))}
        {!p.invoiceId && (
          <ActionButton action={deleteProforma} fields={{ id: p.id }} variant="ghost" size="sm" className="text-red-600 print:hidden" confirm="¿Eliminar esta proforma?">
            Eliminar
          </ActionButton>
        )}
      </PageHeader>

      <Card className="print:border-0 print:shadow-none">
        <CardContent className="space-y-6 pt-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row">
            <div>
              <div className="text-lg font-bold">{p.tenant.name}</div>
              {p.tenant.taxId && <div className="text-sm">RNC/RUC {p.tenant.taxId}</div>}
              {p.tenant.address && <div className="text-sm text-muted-foreground">{p.tenant.address}</div>}
              {p.tenant.phone && <div className="text-sm text-muted-foreground">{p.tenant.phone}</div>}
            </div>
            <div className="text-sm sm:text-right">
              <div className="text-lg font-bold">PROFORMA {p.number}</div>
              <div>Emisión: {formatDate(p.issueDate)}</div>
              <div>Válida hasta: {formatDate(p.validUntil)}</div>
            </div>
          </div>
          <div className="text-sm">
            <div className="text-muted-foreground">Para</div>
            {p.customer ? (
              <>
                <Link href={`/dashboard/customers/${p.customer.id}`} className="font-medium hover:underline">
                  {p.customer.firstName} {p.customer.lastName}
                </Link>
                <div>Cédula/RNC {p.customer.cedula}</div>
                {p.customer.address && <div>{p.customer.address}</div>}
              </>
            ) : (
              <>
                <div className="font-medium">{p.clientName}</div>
                {p.clientInfo && <div>{p.clientInfo}</div>}
              </>
            )}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2">Concepto</th>
                <th className="py-2 text-right">Cant.</th>
                <th className="py-2 text-right">Precio</th>
                <th className="py-2 text-right">Importe</th>
              </tr>
            </thead>
            <tbody>
              {p.items.map((i) => (
                <tr key={i.id} className="border-b">
                  <td className="py-2">{i.description}</td>
                  <td className="py-2 text-right">{toNumber(i.quantity)}</td>
                  <td className="py-2 text-right">{formatCurrency(i.unitPrice, currency)}</td>
                  <td className="py-2 text-right">{formatCurrency(toNumber(i.quantity) * toNumber(i.unitPrice), currency)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className="py-2 text-right font-medium">Total</td>
                <td className="py-2 text-right text-lg font-bold">{formatCurrency(p.total, currency)}</td>
              </tr>
            </tfoot>
          </table>
          {p.notes && <p className="whitespace-pre-line text-sm text-muted-foreground">{p.notes}</p>}
          <p className="text-xs text-muted-foreground">Este documento es una cotización y no constituye una factura.</p>
        </CardContent>
      </Card>

      {p.invoice ? (
        <p className="text-sm print:hidden">
          Convertida en la factura{' '}
          <Link href={`/dashboard/billing/${p.invoice.id}`} className="font-medium text-blue-700 hover:underline">{p.invoice.number}</Link>.
        </p>
      ) : (
        can(user.role, 'billing') &&
        p.status !== 'REJECTED' && (
          <Card className="print:hidden">
            <CardHeader>
              <CardTitle className="text-base">Convertir en factura</CardTitle>
            </CardHeader>
            <CardContent>
              <ConvertForm
                action={convertProforma.bind(null, p.id)}
                needsCustomer={!p.customerId}
                defaultDueDate={toDateInput(addDays(todayIn(user.tenant.timezone), p.tenant.dueDays))}
                customers={customers.map((c) => ({ value: c.id, label: `${c.lastName} ${c.firstName} · ${c.cedula}` }))}
              />
            </CardContent>
          </Card>
        )
      )}
    </div>
  )
}
