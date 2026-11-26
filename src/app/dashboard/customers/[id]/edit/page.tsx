import { notFound } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { updateCustomer } from '../../actions'
import { CustomerForm } from '../../customer-form'

export const metadata = { title: 'Editar cliente' }

export default async function EditCustomerPage({ params }: { params: { id: string } }) {
  const user = await requireUser('customersWrite')
  const customer = await prisma.customer.findFirst({ where: { id: params.id, tenantId: user.tenantId } })
  if (!customer) notFound()

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title={`Editar: ${customer.firstName} ${customer.lastName}`} />
      <Card>
        <CardContent className="pt-6">
          <CustomerForm action={updateCustomer.bind(null, customer.id)} customer={customer} submitLabel="Guardar cambios" />
        </CardContent>
      </Card>
    </div>
  )
}
