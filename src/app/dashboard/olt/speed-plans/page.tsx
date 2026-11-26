import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { DataTable } from '@/components/app/data-table'
import { ActionButton } from '@/components/forms/action-form'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { deleteCatalog, saveSpeedPlan } from '../actions'
import { SpeedPlanFields } from '../catalog-fields'
import { DialogButton, InlineForm } from '../forms'

export const metadata = { title: 'Planes de velocidad OLT' }

export default async function SpeedPlansPage() {
  const user = await requireUser('olt')
  const plans = await prisma.oltSpeedPlan.findMany({ where: { tenantId: user.tenantId }, orderBy: { download: 'asc' }, include: { _count: { select: { onus: true } } } })
  return (
    <div className="space-y-6">
      <PageHeader title="Planes de velocidad" description="Perfiles de tráfico de la OLT que se aplican al autorizar cada ONU (los perfiles deben existir en la OLT)." />
      <DataTable headers={['Plan', 'Velocidad', 'Perfil línea / tcont', 'Perfil servicio', 'VLAN', 'ONUs', '']} rowCount={plans.length} emptyText="Todavía no hay planes de velocidad.">
        {plans.map((p) => (
          <tr key={p.id}>
            <td className="font-medium">{p.name}</td>
            <td>
              {p.download}/{p.upload} Mbps
            </td>
            <td className="font-mono text-xs">{p.lineProfile ?? '—'}</td>
            <td className="font-mono text-xs">{p.srvProfile ?? '—'}</td>
            <td>{p.vlan ?? '—'}</td>
            <td>{p._count.onus}</td>
            <td className="whitespace-nowrap text-right">
              <DialogButton label="Editar" variant="outline" title={`Editar ${p.name}`} action={saveSpeedPlan.bind(null, p.id)} submitLabel="Guardar">
                <SpeedPlanFields v={p} />
              </DialogButton>{' '}
              <ActionButton action={deleteCatalog} fields={{ id: p.id, kind: 'plan' }} variant="ghost" size="sm" className="text-red-600" confirm={`¿Eliminar el plan ${p.name}?`}>
                Eliminar
              </ActionButton>
            </td>
          </tr>
        ))}
      </DataTable>
      <Card>
        <CardHeader>
          <CardTitle>Nuevo plan de velocidad</CardTitle>
        </CardHeader>
        <CardContent>
          <InlineForm action={saveSpeedPlan.bind(null, null)} submitLabel="Crear plan">
            <SpeedPlanFields />
          </InlineForm>
        </CardContent>
      </Card>
    </div>
  )
}
