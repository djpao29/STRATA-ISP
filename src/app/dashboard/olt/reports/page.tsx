import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { formatDateTime } from '@/lib/format'
import { ONU_STATUS_LABEL } from '@/lib/olt/labels'
import { BRAND_LABEL } from '../shared'

export const metadata = { title: 'Reportes OLT' }

const ACTION_LABEL: Record<string, string> = {
  'onu.authorize': 'ONU autorizada',
  'onu.authorize_failed': 'Falló la autorización',
  'onu.preauthorize': 'ONU pre-autorizada',
  'onu.delete': 'ONU quitada del sistema',
  'onu.update': 'ONU actualizada',
  'olt.create': 'OLT registrada',
  'olt.update': 'OLT actualizada',
  'olt.delete': 'OLT eliminada',
  'olt.settings': 'Alertas cambiadas',
}

export default async function OltReportsPage() {
  const user = await requireUser('olt')
  const tenantId = user.tenantId
  const [olts, byStatus, byModel, byPlan, noCustomer, log] = await Promise.all([
    prisma.oLT.findMany({ where: { tenantId }, orderBy: { name: 'asc' }, include: { _count: { select: { onus: true } } } }),
    prisma.oNU.groupBy({ by: ['oltId', 'status'], where: { olt: { tenantId }, inOlt: true }, _count: true }),
    prisma.oNU.groupBy({ by: ['onuModelId'], where: { olt: { tenantId }, authState: 'AUTHORIZED' }, _count: true }),
    prisma.oNU.groupBy({ by: ['speedPlanId'], where: { olt: { tenantId }, authState: 'AUTHORIZED' }, _count: true }),
    prisma.oNU.count({ where: { olt: { tenantId }, authState: 'AUTHORIZED', customerId: null } }),
    prisma.auditLog.findMany({
      where: { tenantId, OR: [{ action: { startsWith: 'onu.' } }, { action: { startsWith: 'olt.' } }] },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { user: { select: { name: true } } },
    }),
  ])
  const [models, plans] = await Promise.all([
    prisma.onuModel.findMany({ where: { tenantId }, select: { id: true, name: true } }),
    prisma.oltSpeedPlan.findMany({ where: { tenantId }, select: { id: true, name: true } }),
  ])
  const statuses = ['ACTIVE', 'POWER_OFF', 'LOS', 'OFFLINE'] as const
  const tz = user.tenant.timezone

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Resumen de ONUs por OLT, modelo y plan, y el historial de cambios.">
        <a href="/api/export?type=onus" className="rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50">
          Descargar ONUs (CSV)
        </a>
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">ONUs por OLT</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-gray-500">
              <tr>
                <th className="py-1">OLT</th>
                <th>En el sistema</th>
                {statuses.map((s) => (
                  <th key={s}>{ONU_STATUS_LABEL[s]}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {olts.map((o) => (
                <tr key={o.id}>
                  <td className="py-1.5">
                    {o.name} <span className="text-xs text-muted-foreground">{BRAND_LABEL[o.brand]}</span>
                  </td>
                  <td>{o._count.onus}</td>
                  {statuses.map((s) => (
                    <td key={s}>{byStatus.find((b) => b.oltId === o.id && b.status === s)?._count ?? 0}</td>
                  ))}
                </tr>
              ))}
              {olts.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-muted-foreground">
                    No hay OLTs.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {noCustomer > 0 && <p className="mt-2 text-xs text-amber-700">{noCustomer} ONU(s) autorizadas sin cliente asignado.</p>}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {[
          { title: 'Por modelo', rows: byModel.map((b) => [models.find((m) => m.id === b.onuModelId)?.name ?? 'Sin modelo', b._count] as const) },
          { title: 'Por plan de velocidad', rows: byPlan.map((b) => [plans.find((p) => p.id === b.speedPlanId)?.name ?? 'Sin plan', b._count] as const) },
        ].map((t) => (
          <Card key={t.title}>
            <CardHeader>
              <CardTitle className="text-base">{t.title}</CardTitle>
            </CardHeader>
            <CardContent>
              {t.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin datos.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {t.rows
                    .slice()
                    .sort((a, b) => b[1] - a[1])
                    .map(([n, c]) => (
                      <li key={n} className="flex justify-between py-1.5">
                        <span>{n}</span>
                        <span className="font-semibold">{c}</span>
                      </li>
                    ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historial</CardTitle>
        </CardHeader>
        <CardContent>
          {log.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin actividad.</p>
          ) : (
            <ul className="divide-y text-sm">
              {log.map((l) => {
                const d = (l.details ?? {}) as { serial?: string; error?: string }
                return (
                  <li key={l.id} className="py-1.5">
                    <span className="text-xs text-muted-foreground">{formatDateTime(l.createdAt, tz)}</span> · {ACTION_LABEL[l.action] ?? l.action}
                    {d.serial ? ` ${d.serial}` : ''}
                    {d.error ? <span className="text-red-700"> — {d.error}</span> : ''}
                    {l.user ? <span className="text-xs text-muted-foreground"> · {l.user.name}</span> : ''}
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
