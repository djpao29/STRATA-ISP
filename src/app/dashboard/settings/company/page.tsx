import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { updateCompany } from '../actions'
import { CompanyForm } from '../forms'
import { BackToSettings } from '../settings-ui'

export const metadata = { title: 'Empresa' }

export default async function CompanySettingsPage() {
  const me = await requireUser('settings')
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: me.tenantId } })
  return (
    <div className="space-y-6">
      <BackToSettings />
      <PageHeader title="Empresa" description="Datos de la empresa, moneda, zona horaria y numeración de facturas" />
      <Card>
        <CardContent className="pt-6">
          <CompanyForm action={updateCompany} tenant={tenant} />
        </CardContent>
      </Card>
    </div>
  )
}
