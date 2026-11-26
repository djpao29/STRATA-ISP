import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { DataTable } from '@/components/app/data-table'
import { ActionButton } from '@/components/forms/action-form'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { deleteCatalog, saveOnuModel } from '../actions'
import { ModelFields } from '../catalog-fields'
import { DialogButton, InlineForm } from '../forms'
import { BRAND_LABEL } from '../shared'

export const metadata = { title: 'Modelos de ONU' }

export default async function ModelsPage() {
  const user = await requireUser('olt')
  const models = await prisma.onuModel.findMany({ where: { tenantId: user.tenantId }, orderBy: { name: 'asc' }, include: { _count: { select: { onus: true } } } })
  return (
    <div className="space-y-6">
      <PageHeader title="Modelos de ONU" description="Catálogo de equipos ONU. El «tipo en la OLT» se usa al autorizar en ZTE." />
      <DataTable headers={['Modelo', 'Marca', 'Tipo en la OLT', 'Puertos', 'Wi-Fi / CATV', 'ONUs', '']} rowCount={models.length} emptyText="Todavía no hay modelos.">
        {models.map((m) => (
          <tr key={m.id}>
            <td className="font-medium">{m.name}</td>
            <td>{m.brand ? BRAND_LABEL[m.brand] : '—'}</td>
            <td className="font-mono text-xs">{m.oltType ?? '—'}</td>
            <td>
              {m.ethPorts} LAN{m.potsPorts ? ` · ${m.potsPorts} tel.` : ''}
            </td>
            <td>{[m.wifi && 'Wi-Fi', m.catv && 'CATV'].filter(Boolean).join(' · ') || '—'}</td>
            <td>{m._count.onus}</td>
            <td className="whitespace-nowrap text-right">
              <DialogButton label="Editar" variant="outline" title={`Editar ${m.name}`} action={saveOnuModel.bind(null, m.id)} submitLabel="Guardar">
                <ModelFields v={m} />
              </DialogButton>{' '}
              <ActionButton action={deleteCatalog} fields={{ id: m.id, kind: 'model' }} variant="ghost" size="sm" className="text-red-600" confirm={`¿Eliminar el modelo ${m.name}?`}>
                Eliminar
              </ActionButton>
            </td>
          </tr>
        ))}
      </DataTable>
      <Card>
        <CardHeader>
          <CardTitle>Nuevo modelo</CardTitle>
        </CardHeader>
        <CardContent>
          <InlineForm action={saveOnuModel.bind(null, null)} submitLabel="Crear modelo">
            <ModelFields />
          </InlineForm>
        </CardContent>
      </Card>
    </div>
  )
}
