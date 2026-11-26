import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { requireUser } from '@/lib/session'
import { createZone } from '../actions'
import { ZoneForm } from '../zone-form'

export const metadata = { title: 'Nueva zona' }

export default async function NewZonePage() {
  await requireUser('zonesWrite')
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Nueva zona" description="Ciclo de facturación, pago y corte" />
      <Card>
        <CardContent className="pt-6">
          <ZoneForm action={createZone} submitLabel="Crear zona" />
        </CardContent>
      </Card>
    </div>
  )
}
