import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { createCustomer } from '../actions'
import { CustomerForm } from '../customer-form'

export const metadata = { title: 'Nuevo cliente' }

export default async function NewCustomerPage() {
  const user = await requireUser('customersWrite')
  const zones = (await prisma.zone.findMany({ where: { tenantId: user.tenantId, isActive: true }, orderBy: { invoiceDay: 'asc' } })).map((z) => ({
    value: z.id,
    label: `${z.name} (factura día ${z.invoiceDay}, corte día ${z.suspendDay})`,
  }))
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Nuevo cliente" />
      <Card>
        <CardContent className="pt-6">
          <CustomerForm action={createCustomer} zones={zones} submitLabel="Crear cliente" />
        </CardContent>
      </Card>
    </div>
  )
}
