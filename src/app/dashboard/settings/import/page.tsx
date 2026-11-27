import { PageHeader } from '@/components/app/page-header'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { ImportProfilesForm } from '../../plans/import-form'
import { RouterCustomerImport } from '../../plans/customer-import'
import { BackToSettings } from '../settings-ui'

export const metadata = { title: 'Importar desde MikroTik' }

export default async function ImportSettingsPage() {
  const me = await requireUser('settings')
  const [routers, zones] = await Promise.all([
    prisma.router.findMany({ where: { tenantId: me.tenantId, type: 'MIKROTIK' }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.zone.findMany({ where: { tenantId: me.tenantId, isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ])
  const routerOptions = routers.map((r) => ({ value: r.id, label: r.name }))
  const zoneOptions = zones.map((z) => ({ value: z.id, label: z.name }))
  return (
    <div className="space-y-6">
      <BackToSettings />
      <PageHeader
        title="Importar desde MikroTik"
        description="Trae los planes y los clientes que ya tienes en tus MikroTik, para no cargarlos uno por uno. Solo lee el router: no cambia nada en él."
      />

      <section className="space-y-3">
        <h2 className="text-base font-bold text-gray-900">Planes</h2>
        <ImportProfilesForm kind="SIMPLE_QUEUE" routers={routerOptions} />
        <ImportProfilesForm kind="PPPOE" routers={routerOptions} />
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-gray-900">Clientes</h2>
        <RouterCustomerImport kind="SIMPLE_QUEUE" routers={routerOptions} zones={zoneOptions} />
        <RouterCustomerImport kind="PPPOE" routers={routerOptions} zones={zoneOptions} />
      </section>
    </div>
  )
}
