import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { DataTable } from '@/components/app/data-table'
import { ActionButton } from '@/components/forms/action-form'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { cn } from '@/lib/utils'
import { deleteCatalog, saveNap } from '../actions'
import { NapFields } from '../catalog-fields'
import { DialogButton, InlineForm } from '../forms'

export const metadata = { title: 'Cajas NAP' }

export default async function NapPage() {
  const user = await requireUser('olt')
  const [naps, olts] = await Promise.all([
    prisma.napBox.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { name: 'asc' },
      include: { olt: { select: { name: true, frame: true } }, onus: { select: { napPort: true, status: true, inOlt: true, customer: { select: { firstName: true, lastName: true } } } } },
    }),
    prisma.oLT.findMany({ where: { tenantId: user.tenantId }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ])
  const oltOpts = olts.map((o) => ({ value: o.id, label: o.name }))
  return (
    <div className="space-y-6">
      <PageHeader title="Cajas NAP" description="Puntos de distribución con su splitter y ocupación. Asigna cada ONU a su caja y puerto desde «ONUs autorizadas»." />
      <DataTable headers={['Caja', 'OLT · PON', 'Splitter', 'Ocupación', 'En línea', 'Ubicación', '']} rowCount={naps.length} emptyText="Todavía no hay cajas NAP.">
        {naps.map((n) => {
          const used = n.onus.length
          const pct = Math.round((used / n.capacity) * 100)
          return (
            <tr key={n.id}>
              <td>
                <div className="font-medium">{n.name}</div>
                {n.address && <div className="text-xs text-muted-foreground">{n.address}</div>}
              </td>
              <td className="text-xs">{n.olt ? `${n.olt.name}${n.ponSlot != null && n.ponPort != null ? ` · ${n.olt.frame}/${n.ponSlot}/${n.ponPort}` : ''}` : '—'}</td>
              <td>{n.splitter ?? '—'}</td>
              <td className="min-w-[140px]">
                <div className="text-xs">
                  {used}/{n.capacity} puertos
                </div>
                <div className="mt-1 h-1.5 rounded bg-gray-100">
                  <div className={cn('h-1.5 rounded', pct >= 100 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-500' : 'bg-emerald-500')} style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
              </td>
              <td>{n.onus.filter((o) => o.inOlt && o.status === 'ACTIVE').length}</td>
              <td className="font-mono text-xs">
                {n.coordinates ? (
                  <a className="text-blue-700 hover:underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${encodeURIComponent(n.coordinates)}`}>
                    {n.coordinates}
                  </a>
                ) : (
                  '—'
                )}
              </td>
              <td className="whitespace-nowrap text-right">
                <DialogButton label="Editar" variant="outline" title={`Editar ${n.name}`} action={saveNap.bind(null, n.id)} submitLabel="Guardar">
                  <NapFields olts={oltOpts} v={n} />
                  {n.onus.length > 0 && (
                    <div className="text-xs">
                      <p className="font-medium">Puertos ocupados</p>
                      <ul className="mt-1 grid grid-cols-2 gap-1">
                        {n.onus
                          .slice()
                          .sort((a, b) => (a.napPort ?? 999) - (b.napPort ?? 999))
                          .map((o, i) => (
                            <li key={i}>
                              Puerto {o.napPort ?? '?'}: {o.customer ? `${o.customer.firstName} ${o.customer.lastName}` : 'sin cliente'}
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}
                </DialogButton>{' '}
                <ActionButton action={deleteCatalog} fields={{ id: n.id, kind: 'nap' }} variant="ghost" size="sm" className="text-red-600" confirm={`¿Eliminar la caja ${n.name}? Sus ONUs quedan sin caja.`}>
                  Eliminar
                </ActionButton>
              </td>
            </tr>
          )
        })}
      </DataTable>
      <Card>
        <CardHeader>
          <CardTitle>Nueva caja NAP</CardTitle>
        </CardHeader>
        <CardContent>
          <InlineForm action={saveNap.bind(null, null)} submitLabel="Crear caja">
            <NapFields olts={oltOpts} />
          </InlineForm>
        </CardContent>
      </Card>
    </div>
  )
}
