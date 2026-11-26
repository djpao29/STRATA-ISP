import { notFound } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { updateRouter } from '../../actions'
import { RouterForm } from '../../router-form'

export const metadata = { title: 'Editar router' }

export default async function EditRouterPage({ params }: { params: { id: string } }) {
  const user = await requireUser('routers')
  const router = await prisma.router.findFirst({
    where: { id: params.id, tenantId: user.tenantId },
    select: { id: true, name: true, host: true, port: true, username: true, type: true, useHttps: true, verifyTls: true, monitoringEnabled: true },
  })
  if (!router) notFound()

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title={`Editar router: ${router.name}`} />
      <Card>
        <CardContent className="pt-6">
          <RouterForm action={updateRouter.bind(null, router.id)} router={router} submitLabel="Guardar cambios" />
        </CardContent>
      </Card>
    </div>
  )
}
