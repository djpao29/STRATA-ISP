import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { addDays } from '@/lib/billing-rules'
import { todayIn } from '@/lib/dates'
import { toDateInput } from '@/lib/format'
import { createInvoice } from '../actions'
import { InvoiceForm } from '../forms'

export const metadata = { title: 'Nueva factura' }

export default async function NewInvoicePage({ searchParams }: { searchParams: { customerId?: string } }) {
  const user = await requireUser('billing')
  const [customers, tenant] = await Promise.all([
    prisma.customer.findMany({
      where: { tenantId: user.tenantId, status: { not: 'CANCELLED' } },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: { id: true, firstName: true, lastName: true, cedula: true },
    }),
    prisma.tenant.findUniqueOrThrow({ where: { id: user.tenantId }, select: { dueDays: true } }),
  ])

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title="Nueva factura"
        description="Para cargos puntuales. La mensualidad del servicio se genera desde Facturación mensual."
      />
      <Card>
        <CardContent className="pt-6">
          {customers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Primero registra un cliente.</p>
          ) : (
            <InvoiceForm
              action={createInvoice}
              customers={customers.map((c) => ({ value: c.id, label: `${c.lastName} ${c.firstName}${c.cedula ? ` · ${c.cedula}` : ''}` }))}
              defaultCustomerId={customers.some((c) => c.id === searchParams.customerId) ? searchParams.customerId : undefined}
              defaultDueDate={toDateInput(addDays(todayIn(user.tenant.timezone), tenant.dueDays))}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
