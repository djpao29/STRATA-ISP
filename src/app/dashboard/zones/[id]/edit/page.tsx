import { notFound } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { updateZone } from '../../actions'
import { ZoneForm } from '../../zone-form'

export const metadata = { title: 'Configurar zona' }

export default async function EditZonePage({ params }: { params: { id: string } }) {
  const user = await requireUser('zonesWrite')
  const zone = await prisma.zone.findFirst({ where: { id: params.id, tenantId: user.tenantId } })
  if (!zone) notFound()
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title={`Configurar: ${zone.name}`}
        description="Los cambios aplican desde el próximo ciclo. Las facturas ya emitidas conservan sus fechas."
      />
      <Card>
        <CardContent className="pt-6">
          <ZoneForm action={updateZone.bind(null, zone.id)} zone={zone} submitLabel="Guardar cambios" />
        </CardContent>
      </Card>
    </div>
  )
}
