import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { requireUser } from '@/lib/session'
import { createRouter } from '../actions'
import { RouterForm } from '../router-form'

export const metadata = { title: 'Nuevo router' }

export default async function NewRouterPage() {
  await requireUser('routers')
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Nuevo router" />
      <Card>
        <CardContent className="pt-6">
          <RouterForm action={createRouter} submitLabel="Guardar router" />
        </CardContent>
      </Card>
    </div>
  )
}
