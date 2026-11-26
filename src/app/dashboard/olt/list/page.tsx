import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { DataTable } from '@/components/app/data-table'
import { ActionButton } from '@/components/forms/action-form'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { pollNow, saveOlt } from '../actions'
import { OltForm } from '../forms'
import { templates } from '../options'
import { BRAND_LABEL, fmtUptime } from '../shared'

export const metadata = { title: 'OLT' }

export default async function OltListPage() {
  const user = await requireUser('olt')
  const olts = await prisma.oLT.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { name: 'asc' },
    include: { _count: { select: { onus: true, discoveries: { where: { active: true } } } } },
  })
  const online = await prisma.oNU.groupBy({ by: ['oltId'], where: { olt: { tenantId: user.tenantId }, inOlt: true, status: 'ACTIVE' }, _count: true })

  return (
    <div className="space-y-6">
      <PageHeader title="OLT" description="Equipos OLT GPON (Huawei, ZTE, VSOL): lectura por SNMP y autorización de ONUs por consola">
        {olts.length > 0 && (
          <ActionButton action={pollNow} variant="outline">
            Leer todas ahora
          </ActionButton>
        )}
      </PageHeader>

      <DataTable headers={['OLT', 'Marca', 'Host', 'ONUs', 'En línea', 'Sin autorizar', 'Estado', 'Temperatura', 'Encendida', 'Última lectura', '']} rowCount={olts.length} emptyText="Todavía no hay OLTs registradas.">
        {olts.map((o) => (
          <tr key={o.id}>
            <td>
              <Link href={`/dashboard/olt/${o.id}`} className="font-medium text-blue-700 hover:underline">
                {o.name}
              </Link>
            </td>
            <td>
              {BRAND_LABEL[o.brand]}
              {o.vendor && <div className="text-xs text-muted-foreground">{o.vendor}</div>}
            </td>
            <td className="font-mono text-xs">{o.host}</td>
            <td>{o._count.onus}</td>
            <td>{online.find((x) => x.oltId === o.id)?._count ?? 0}</td>
            <td>{o._count.discoveries ? <span className="font-semibold text-orange-600">{o._count.discoveries}</span> : 0}</td>
            <td>
              <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', o.status === 'ONLINE' ? 'bg-green-100 text-green-800' : o.status === 'OFFLINE' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-700')}>
                {o.status === 'ONLINE' ? 'En línea' : o.status === 'OFFLINE' ? 'Sin respuesta' : 'Sin leer'}
              </span>
              {o.lastError && <div className="max-w-[220px] truncate text-[11px] text-red-600" title={o.lastError}>{o.lastError}</div>}
            </td>
            <td>{o.temperature != null ? `${o.temperature} °C` : '—'}</td>
            <td>{fmtUptime(o.uptimeSec)}</td>
            <td className="whitespace-nowrap text-xs">{o.lastPollAt ? formatDateTime(o.lastPollAt, user.tenant.timezone) : '—'}</td>
            <td>
              <ActionButton action={pollNow} fields={{ id: o.id }} variant="outline" size="sm">
                Leer
              </ActionButton>
            </td>
          </tr>
        ))}
      </DataTable>

      <Card>
        <CardHeader>
          <CardTitle>Agregar OLT</CardTitle>
        </CardHeader>
        <CardContent>
          <OltForm action={saveOlt.bind(null, null)} templates={templates} submitLabel="Guardar OLT" />
        </CardContent>
      </Card>
    </div>
  )
}
