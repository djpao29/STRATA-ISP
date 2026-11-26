import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { requireUser } from '@/lib/session'
import { createCustomer } from '../actions'
import { CustomerForm } from '../customer-form'

export const metadata = { title: 'Nuevo cliente' }

export default async function NewCustomerPage() {
  await requireUser('customersWrite')
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Nuevo cliente" />
      <Card>
        <CardContent className="pt-6">
          <CustomerForm action={createCustomer} submitLabel="Crear cliente" />
        </CardContent>
      </Card>
    </div>
  )
}
