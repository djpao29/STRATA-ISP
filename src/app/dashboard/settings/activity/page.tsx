import { PageHeader } from '@/components/app/page-header'
import { DataTable } from '@/components/app/data-table'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { formatDateTime } from '@/lib/format'
import { BackToSettings } from '../settings-ui'

export const metadata = { title: 'Log de actividad' }

export default async function ActivitySettingsPage() {
  const me = await requireUser('settings')
  const logs = await prisma.auditLog.findMany({
    where: { tenantId: me.tenantId },
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { user: { select: { name: true } } },
  })
  return (
    <div className="space-y-6">
      <BackToSettings />
      <PageHeader title="Log de actividad" description="Las últimas 200 acciones registradas en el sistema" />

      <DataTable title="Actividad" headers={['Fecha', 'Usuario', 'Acción', 'Entidad']} rowCount={logs.length} emptyText="Sin actividad registrada.">
        {logs.map((l) => (
          <tr key={l.id}>
            <td>{formatDateTime(l.createdAt)}</td>
            <td>{l.user?.name ?? '—'}</td>
            <td className="font-mono text-xs">{l.action}</td>
            <td className="text-xs text-muted-foreground">
              {l.entity}
              {l.entityId && ` · ${l.entityId}`}
            </td>
          </tr>
        ))}
      </DataTable>
    </div>
  )
}
