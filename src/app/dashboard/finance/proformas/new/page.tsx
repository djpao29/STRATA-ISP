import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { toDateInput } from '@/lib/format'
import { addDays } from '@/lib/billing-rules'
import { todayIn } from '@/lib/dates'
import { createProforma } from '../actions'
import { ProformaForm } from '../proforma-form'

export const metadata = { title: 'Nueva proforma' }

export default async function NewProformaPage() {
  const user = await requireUser('finance')
  const [customers, plans] = await Promise.all([
    prisma.customer.findMany({
      where: { tenantId: user.tenantId, status: { not: 'CANCELLED' } },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: { id: true, firstName: true, lastName: true, cedula: true },
    }),
    prisma.plan.findMany({ where: { tenantId: user.tenantId, isActive: true }, orderBy: { price: 'asc' }, select: { name: true, price: true } }),
  ])
  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title="Nueva proforma" />
      <Card>
        <CardContent className="pt-6">
          <ProformaForm
            action={createProforma}
            currency={user.tenant.currency}
            defaultValidUntil={toDateInput(addDays(todayIn(user.tenant.timezone), 15))}
            customers={customers.map((c) => ({ value: c.id, label: `${c.lastName} ${c.firstName}${c.cedula ? ` · ${c.cedula}` : ''}` }))}
            plans={plans.map((p) => ({ name: p.name, price: p.price.toFixed(2) }))}
          />
        </CardContent>
      </Card>
    </div>
  )
}
