'use client'

import Link from 'next/link'
import { AlertTriangle, ArrowDown, ArrowUp, Cpu, Plus, Router as RouterIcon, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ActionButton } from '@/components/forms/action-form'
import { usePolling } from '@/components/monitoring/use-polling'
import { MiniStat, RouterStatusBadge, SeverityTag } from '@/components/monitoring/widgets'
import { formatBps, formatUptime, percent } from '@/lib/monitoring/units'
import { refreshRouter, toggleMonitoring } from './actions'

type Metric = {
  at: string
  latencyMs: number
  cpuLoad: number
  memUsed: number
  memTotal: number
  temperature: number | null
  uptimeSec: number
  pppActive: number | null
  wanRxBps: number | null
  wanTxBps: number | null
}
type RouterRow = {
  id: string
  name: string
  host: string
  status: string
  monitoringEnabled: boolean
  identity: string | null
  model: string | null
  osVersion: string | null
  lastSeenAt: string | null
  lastCheckedAt: string | null
  lastError: string | null
  metric: Metric | null
  activeAlerts: number
}
type Alert = { id: string; severity: string; message: string; startedAt: string; routerId: string; router: { name: string } }

export function OverviewClient({ timeZone, canManage }: { timeZone: string; canManage: boolean }) {
  const { data, error, updatedAt, reload } = usePolling<{ routers: RouterRow[]; alerts: Alert[] }>('/api/monitoring/overview', 10_000)
  const time = (v: string | Date | null) =>
    v ? new Intl.DateTimeFormat('es-EC', { timeStyle: 'medium', dateStyle: 'short', timeZone }).format(new Date(v)) : '—'

  if (!data) {
    return <p className="text-sm text-muted-foreground">{error ?? 'Cargando estado de los routers…'}</p>
  }

  const routers = data.routers
  if (routers.length === 0) {
    return (
      <Card>
        <CardContent className="space-y-3 py-10 text-center">
          <RouterIcon className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No hay routers MikroTik registrados.</p>
          <Button asChild>
            <Link href="/dashboard/routers/new">
              <Plus className="mr-2 h-4 w-4" />
              Registrar un MikroTik
            </Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  const online = routers.filter((r) => r.status === 'ONLINE' || r.status === 'DEGRADED').length
  const ppp = routers.reduce((s, r) => s + (r.metric?.pppActive ?? 0), 0)
  const wanDown = routers.reduce((s, r) => s + (r.metric?.wanRxBps ?? 0), 0)
  const wanUp = routers.reduce((s, r) => s + (r.metric?.wanTxBps ?? 0), 0)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat label="Routers en línea" value={`${online} / ${routers.length}`} icon={<RouterIcon className="h-5 w-5" />} />
        <MiniStat label="Sesiones PPPoE activas" value={ppp} icon={<Users className="h-5 w-5" />} />
        <MiniStat
          label="Tráfico WAN total"
          value={
            <span className="flex flex-wrap gap-x-3 text-base">
              <span className="flex items-center"><ArrowDown className="h-4 w-4 text-blue-600" />{formatBps(wanDown)}</span>
              <span className="flex items-center"><ArrowUp className="h-4 w-4 text-green-600" />{formatBps(wanUp)}</span>
            </span>
          }
          hint="Promedio del último ciclo"
          icon={<Cpu className="h-5 w-5" />}
        />
        <MiniStat label="Alertas activas" value={data.alerts.length} icon={<AlertTriangle className="h-5 w-5" />} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {routers.map((r) => {
          const m = r.metric
          const mem = m ? percent(m.memUsed, m.memTotal) : null
          return (
            <Card key={r.id} className={r.status === 'OFFLINE' ? 'border-red-200' : r.status === 'DEGRADED' ? 'border-amber-200' : ''}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/dashboard/monitoring/${r.id}`} className="block truncate text-lg font-semibold text-blue-700 hover:underline">
                      {r.name}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">
                      {[r.identity, r.model, r.osVersion && `RouterOS ${r.osVersion}`, r.host].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <RouterStatusBadge status={r.status} paused={!r.monitoringEnabled} />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {m ? (
                  <dl className="grid grid-cols-3 gap-2 text-center text-sm">
                    <Cell label="CPU" value={`${m.cpuLoad}%`} warn={m.cpuLoad >= 85} />
                    <Cell label="RAM" value={`${mem}%`} warn={(mem ?? 0) >= 90} />
                    <Cell label="Respuesta" value={`${m.latencyMs} ms`} />
                    <Cell label="Activo" value={formatUptime(m.uptimeSec)} />
                    <Cell label="PPPoE" value={m.pppActive ?? 'N/D'} />
                    <Cell label="Temp." value={m.temperature != null ? `${m.temperature} °C` : 'N/D'} />
                    <Cell label="WAN ↓" value={formatBps(m.wanRxBps)} />
                    <Cell label="WAN ↑" value={formatBps(m.wanTxBps)} />
                    <Cell label="Alertas" value={r.activeAlerts} warn={r.activeAlerts > 0} />
                  </dl>
                ) : (
                  <p className="text-sm text-muted-foreground">Todavía no hay datos de este router.</p>
                )}
                {r.lastError && r.status !== 'ONLINE' && (
                  <p className="rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700">{r.lastError}</p>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>Último dato: {time(r.lastSeenAt)}</span>
                  <span className="flex gap-1">
                    <ActionButton action={async (s, f) => { const res = await refreshRouter(s, f); reload(); return res }} fields={{ id: r.id }} variant="outline" size="sm">
                      Actualizar
                    </ActionButton>
                    {canManage && (
                      <ActionButton action={async (s, f) => { const res = await toggleMonitoring(s, f); reload(); return res }} fields={{ id: r.id }} variant="ghost" size="sm">
                        {r.monitoringEnabled ? 'Pausar' : 'Reanudar'}
                      </ActionButton>
                    )}
                  </span>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Alertas activas</CardTitle>
        </CardHeader>
        <CardContent>
          {data.alerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin alertas. Todos los routers dentro de los límites.</p>
          ) : (
            <ul className="divide-y">
              {data.alerts.map((a) => (
                <li key={a.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <span className="flex items-center gap-2 text-sm">
                    <SeverityTag severity={a.severity} />
                    <Link href={`/dashboard/monitoring/${a.routerId}`} className="font-medium hover:underline">{a.router.name}</Link>
                    <span>{a.message}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">desde {time(a.startedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Pantalla actualizada {updatedAt ? time(updatedAt) : '—'}{error ? ` · ${error}` : ''}
      </p>
    </div>
  )
}

function Cell({ label, value, warn }: { label: string; value: React.ReactNode; warn?: boolean }) {
  return (
    <div className="rounded-md bg-gray-50 px-2 py-1.5">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className={warn ? 'font-semibold text-red-600' : 'font-semibold'}>{value}</dd>
    </div>
  )
}
