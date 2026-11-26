'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Activity, ArrowDown, ArrowUp, Gauge as GaugeIcon, Network, Pencil, Users } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { ActionButton } from '@/components/forms/action-form'
import { usePolling } from '@/components/monitoring/use-polling'
import { Fact, Gauge, MiniStat, RouterStatusBadge, SeverityTag } from '@/components/monitoring/widgets'
import { formatBps, formatBytes, formatUptime, percent } from '@/lib/monitoring/units'
import { cn } from '@/lib/utils'
import { refreshRouter } from '../actions'
import { InterfacesTable, type Iface } from './interfaces-table'
import { ClientsPanel } from './clients-panel'

type Metric = {
  at: string
  latencyMs: number
  cpuLoad: number
  memUsed: number
  memTotal: number
  hddUsed: number
  hddTotal: number
  temperature: number | null
  voltage: number | null
  uptimeSec: number
  pppActive: number | null
  wanRxBps: number | null
  wanTxBps: number | null
}
type Alert = { id: string; key: string; severity: string; status: string; message: string; startedAt: string; resolvedAt: string | null }
type Detail = {
  id: string
  name: string
  host: string
  port: number
  useHttps: boolean
  status: string
  monitoringEnabled: boolean
  identity: string | null
  model: string | null
  osVersion: string | null
  lastSeenAt: string | null
  lastError: string | null
  latencyMs: number | null
  metric: Metric | null
  interfaces: Iface[]
  alerts: Alert[]
}
type Live = { at: string; traffic: Array<{ name: string; rxBps: number; txBps: number }>; cores: Array<{ name: string; load: number }> }
type History = {
  metrics: Array<{ t: string; cpu: number; mem: number; latency: number; temp: number | null; rx: number | null; tx: number | null; ppp: number | null }>
  traffic: Array<{ t: string; rx: number; tx: number }> | null
}

const RANGES = [
  { value: '1h', label: '1 hora' },
  { value: '6h', label: '6 horas' },
  { value: '24h', label: '24 horas' },
  { value: '7d', label: '7 días' },
]

export function RouterMonitor(props: {
  routerId: string
  routerName: string
  isMikrotik: boolean
  timeZone: string
  liveRefreshSec: number
  canEditRouter: boolean
  thresholds: { cpu: number; mem: number }
}) {
  const { routerId, timeZone, liveRefreshSec } = props
  const detail = usePolling<Detail>(`/api/monitoring/routers/${routerId}`, 10_000)
  const d = detail.data
  const m = d?.metric ?? null

  const fmtTime = useMemo(() => new Intl.DateTimeFormat('es-EC', { timeStyle: 'medium', timeZone }), [timeZone])
  const fmtDateTime = useMemo(() => new Intl.DateTimeFormat('es-EC', { dateStyle: 'short', timeStyle: 'medium', timeZone }), [timeZone])
  const fmtAxis = useMemo(() => new Intl.DateTimeFormat('es-EC', { hour: '2-digit', minute: '2-digit', timeZone }), [timeZone])
  const fmtAxisDay = useMemo(() => new Intl.DateTimeFormat('es-EC', { day: '2-digit', month: 'short', hour: '2-digit', timeZone }), [timeZone])

  // ── Interfaz seleccionada para el tráfico en vivo y el historial ──
  const ifaces = useMemo(() => (d?.interfaces ?? []).filter((i) => !i.missing), [d?.interfaces])
  const [selected, setSelected] = useState<string | null>(null)
  useEffect(() => {
    if (selected || ifaces.length === 0) return
    const wan = ifaces.find((i) => i.role === 'WAN' && i.running) ?? ifaces.find((i) => i.running && !i.disabled) ?? ifaces[0]
    setSelected(wan.name)
  }, [ifaces, selected])
  const selectedIface = ifaces.find((i) => i.name === selected)

  // ── Tráfico en vivo (monitor-traffic) ──
  const live = usePolling<Live>(selected ? `/api/monitoring/routers/${routerId}/live?interfaces=${encodeURIComponent(selected)}` : null, liveRefreshSec * 1000)
  const [series, setSeries] = useState<Array<{ t: number; rx: number; tx: number }>>([])
  useEffect(() => setSeries([]), [selected])
  useEffect(() => {
    const row = live.data?.traffic.find((t) => t.name === selected)
    if (!row || !live.data) return
    const t = new Date(live.data.at).getTime()
    setSeries((prev) => (prev.at(-1)?.t === t ? prev : [...prev.slice(-59), { t, rx: row.rxBps, tx: row.txBps }]))
  }, [live.data, selected])
  const current = series.at(-1)

  // ── Historial ──
  const [range, setRange] = useState('24h')
  const history = usePolling<History>(
    `/api/monitoring/routers/${routerId}/history?range=${range}${selectedIface ? `&interface=${selectedIface.id}` : ''}`,
    60_000
  )
  const axis = range === '7d' ? fmtAxisDay : fmtAxis
  const metricRows = (history.data?.metrics ?? []).map((r) => ({ ...r, t: new Date(r.t).getTime() }))
  const trafficRows = (history.data?.traffic ?? []).map((r) => ({ ...r, t: new Date(r.t).getTime() }))

  const [tab, setTab] = useState<'interfaces' | 'clients' | 'alerts'>('interfaces')

  if (!props.isMikrotik) {
    return (
      <div className="space-y-6">
        <PageHeader title={props.routerName} />
        <p className="text-sm text-muted-foreground">El monitoreo en tiempo real solo está disponible para routers MikroTik con RouterOS 7.</p>
      </div>
    )
  }

  const mem = m ? percent(m.memUsed, m.memTotal) : null
  const hdd = m ? percent(m.hddUsed, m.hddTotal) : null
  const running = ifaces.filter((i) => i.running).length
  const activeAlerts = (d?.alerts ?? []).filter((a) => a.status === 'ACTIVE')

  return (
    <div className="space-y-6">
      <PageHeader title={props.routerName} description="Monitoreo en tiempo real vía API REST de RouterOS">
        {d && <RouterStatusBadge status={d.status} paused={!d.monitoringEnabled} />}
        <ActionButton
          action={async (s, f) => {
            const r = await refreshRouter(s, f)
            detail.reload()
            history.reload()
            return r
          }}
          fields={{ id: routerId }}
          variant="outline"
        >
          Actualizar ahora
        </ActionButton>
        {props.canEditRouter && (
          <Button asChild variant="outline">
            <Link href={`/dashboard/routers/${routerId}/edit`}>
              <Pencil className="mr-2 h-4 w-4" />
              Conexión
            </Link>
          </Button>
        )}
      </PageHeader>

      {detail.error && !d && <p className="text-sm text-red-600">{detail.error}</p>}
      {!d && !detail.error && <p className="text-sm text-muted-foreground">Cargando…</p>}

      {d && (
        <>
          {d.lastError && d.status !== 'ONLINE' && d.status !== 'DEGRADED' && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <strong>Sin conexión con el router.</strong> {d.lastError}
            </div>
          )}
          {!m && !d.lastError && (
            <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              Aún no hay datos. El recolector consulta el router en unos segundos, o pulsa &quot;Actualizar ahora&quot;.
            </div>
          )}

          {/* Estado del equipo + recursos */}
          <Card>
            <CardContent className="grid grid-cols-1 gap-6 pt-6 xl:grid-cols-[1fr_auto]">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
                <Fact label="Identidad" value={d.identity} />
                <Fact label="Modelo" value={d.model} />
                <Fact label="RouterOS" value={d.osVersion} />
                <Fact label="Tiempo activo" value={m ? formatUptime(m.uptimeSec) : null} unavailable="—" />
                <Fact label="IP de administración" value={`${d.host}:${d.port} (${d.useHttps ? 'HTTPS' : 'HTTP'})`} />
                <Fact label="Tiempo de respuesta" value={m ? `${m.latencyMs} ms` : null} unavailable="—" />
                <Fact label="Temperatura" value={m?.temperature != null ? `${m.temperature} °C` : null} />
                <Fact label="Voltaje" value={m?.voltage != null ? `${m.voltage} V` : null} />
                <Fact label="Última actualización" value={d.lastSeenAt ? fmtDateTime.format(new Date(d.lastSeenAt)) : null} unavailable="—" />
              </dl>
              <div className="grid grid-cols-3 gap-4">
                <Gauge label="CPU" value={m?.cpuLoad ?? null} warnAt={props.thresholds.cpu - 15} dangerAt={props.thresholds.cpu} caption={live.data?.cores.length ? `${live.data.cores.length} núcleos` : undefined} />
                <Gauge
                  label="Memoria"
                  value={mem}
                  warnAt={props.thresholds.mem - 15}
                  dangerAt={props.thresholds.mem}
                  caption={m ? `${formatBytes(m.memUsed)} / ${formatBytes(m.memTotal)}` : undefined}
                />
                <Gauge label="Almacenamiento" value={hdd} caption={m ? `${formatBytes(m.hddUsed)} / ${formatBytes(m.hddTotal)}` : undefined} />
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MiniStat label="Interfaces con enlace" value={`${running} / ${ifaces.length}`} icon={<Network className="h-5 w-5" />} />
            <MiniStat label="Sesiones PPPoE activas" value={m?.pppActive ?? 'N/D'} hint={m?.pppActive == null ? 'Sin paquete PPP o sin permiso' : undefined} icon={<Users className="h-5 w-5" />} />
            <MiniStat
              label="WAN (último ciclo)"
              value={m?.wanRxBps != null ? `${formatBps(m.wanRxBps)} ↓` : 'Sin WAN marcada'}
              hint={m?.wanTxBps != null ? `${formatBps(m.wanTxBps)} ↑` : 'Márcala en la tabla de interfaces'}
              icon={<GaugeIcon className="h-5 w-5" />}
            />
            <MiniStat label="Alertas activas" value={activeAlerts.length} icon={<Activity className="h-5 w-5" />} />
          </div>

          {/* CPU por núcleo */}
          {live.data && live.data.cores.length > 1 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">CPU por núcleo</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
                {live.data.cores.map((c) => (
                  <div key={c.name}>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{c.name}</span>
                      <span className="font-semibold">{c.load}%</span>
                    </div>
                    <div className="mt-1 h-2 rounded bg-gray-100">
                      <div className={cn('h-2 rounded', c.load >= 90 ? 'bg-red-500' : c.load >= 70 ? 'bg-amber-500' : 'bg-green-500')} style={{ width: `${c.load}%` }} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Tráfico en vivo */}
          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base">Tráfico en tiempo real</CardTitle>
              <div className="flex items-center gap-2">
                <label htmlFor="iface" className="text-sm text-muted-foreground">Interfaz</label>
                <select
                  id="iface"
                  value={selected ?? ''}
                  onChange={(e) => setSelected(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                >
                  {ifaces.map((i) => (
                    <option key={i.id} value={i.name}>
                      {i.name}
                      {i.role !== 'OTHER' ? ` (${i.role})` : ''}
                      {i.isSfp ? ' · SFP' : ''}
                      {!i.running ? ' · sin enlace' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-3 flex flex-wrap gap-6 text-sm">
                <span className="flex items-center gap-1">
                  <ArrowDown className="h-4 w-4 text-blue-600" /> Recibe (RX): <strong>{formatBps(current?.rx)}</strong>
                </span>
                <span className="flex items-center gap-1">
                  <ArrowUp className="h-4 w-4 text-green-600" /> Envía (TX): <strong>{formatBps(current?.tx)}</strong>
                </span>
                <span className="text-xs text-muted-foreground">
                  cada {liveRefreshSec} s{live.error ? ` · ${live.error}` : ''}
                </span>
              </div>
              <div className="h-64">
                {series.length < 2 ? (
                  <p className="pt-20 text-center text-sm text-muted-foreground">{live.error ?? 'Recibiendo datos…'}</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={series}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v) => fmtTime.format(new Date(v))} fontSize={11} />
                      <YAxis tickFormatter={(v) => formatBps(v)} width={80} fontSize={11} />
                      <Tooltip labelFormatter={(v) => fmtTime.format(new Date(v as number))} formatter={(v: number, n) => [formatBps(v), n === 'rx' ? 'Recibe (RX)' : 'Envía (TX)']} />
                      <Legend formatter={(v) => (v === 'rx' ? 'Recibe (RX)' : 'Envía (TX)')} />
                      <Area type="monotone" dataKey="rx" stroke="#2563eb" fill="#2563eb" fillOpacity={0.15} isAnimationActive={false} />
                      <Area type="monotone" dataKey="tx" stroke="#16a34a" fill="#16a34a" fillOpacity={0.1} isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Historial */}
          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base">Historial</CardTitle>
              <div className="flex flex-wrap gap-1">
                {RANGES.map((r) => (
                  <Button key={r.value} size="sm" variant={range === r.value ? 'default' : 'outline'} onClick={() => setRange(r.value)}>
                    {r.label}
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <HistoryChart title={`Consumo de ${selected ?? 'la interfaz'}`} empty={trafficRows.length === 0} emptyText={selectedIface && !selectedIface.monitored ? 'Esta interfaz no guarda historial: actívalo en la tabla de interfaces.' : 'Sin datos en este periodo.'}>
                <AreaChart data={trafficRows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v) => axis.format(new Date(v))} fontSize={11} />
                  <YAxis tickFormatter={(v) => formatBps(v)} width={80} fontSize={11} />
                  <Tooltip labelFormatter={(v) => fmtDateTime.format(new Date(v as number))} formatter={(v: number, n) => [formatBps(v), n === 'rx' ? 'Recibe (RX)' : 'Envía (TX)']} />
                  <Area type="monotone" dataKey="rx" stroke="#2563eb" fill="#2563eb" fillOpacity={0.15} dot={trafficRows.length < 4} />
                  <Area type="monotone" dataKey="tx" stroke="#16a34a" fill="#16a34a" fillOpacity={0.1} dot={trafficRows.length < 4} />
                </AreaChart>
              </HistoryChart>
              <HistoryChart title="CPU y memoria (%)" empty={metricRows.length === 0}>
                <LineChart data={metricRows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v) => axis.format(new Date(v))} fontSize={11} />
                  <YAxis domain={[0, 100]} width={40} fontSize={11} />
                  <Tooltip labelFormatter={(v) => fmtDateTime.format(new Date(v as number))} formatter={(v: number, n) => [`${Math.round(v * 10) / 10}%`, n === 'cpu' ? 'CPU' : 'Memoria']} />
                  <Legend formatter={(v) => (v === 'cpu' ? 'CPU' : 'Memoria')} />
                  <Line type="monotone" dataKey="cpu" stroke="#2563eb" dot={metricRows.length < 4} />
                  <Line type="monotone" dataKey="mem" stroke="#9333ea" dot={metricRows.length < 4} />
                </LineChart>
              </HistoryChart>
              <HistoryChart title="Tiempo de respuesta (ms)" empty={metricRows.length === 0}>
                <LineChart data={metricRows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v) => axis.format(new Date(v))} fontSize={11} />
                  <YAxis width={50} fontSize={11} />
                  <Tooltip labelFormatter={(v) => fmtDateTime.format(new Date(v as number))} formatter={(v: number) => [`${Math.round(v)} ms`, 'Respuesta']} />
                  <Line type="monotone" dataKey="latency" stroke="#f59e0b" dot={metricRows.length < 4} />
                </LineChart>
              </HistoryChart>
              <HistoryChart title="Sesiones PPPoE activas" empty={metricRows.every((r) => r.ppp == null)} emptyText="Sin datos de PPP en este periodo.">
                <LineChart data={metricRows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v) => axis.format(new Date(v))} fontSize={11} />
                  <YAxis allowDecimals={false} width={40} fontSize={11} />
                  <Tooltip labelFormatter={(v) => fmtDateTime.format(new Date(v as number))} formatter={(v: number) => [Math.round(v), 'Sesiones']} />
                  <Line type="stepAfter" dataKey="ppp" stroke="#0891b2" dot={metricRows.length < 4} />
                </LineChart>
              </HistoryChart>
            </CardContent>
          </Card>

          {/* Pestañas */}
          <div className="flex gap-1 border-b">
            {(
              [
                ['interfaces', `Interfaces (${ifaces.length})`],
                ['clients', 'Clientes ISP'],
                ['alerts', `Alertas (${activeAlerts.length})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn(
                  '-mb-px border-b-2 px-4 py-2 text-sm font-medium',
                  tab === key ? 'border-blue-600 text-blue-700' : 'border-transparent text-muted-foreground hover:text-gray-900'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'interfaces' && <InterfacesTable interfaces={d.interfaces} onSaved={detail.reload} onSelect={setSelected} />}
          {tab === 'clients' && <ClientsPanel routerId={routerId} />}
          {tab === 'alerts' && (
            <Card>
              <CardContent className="pt-6">
                {d.alerts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Este router no ha tenido alertas.</p>
                ) : (
                  <ul className="divide-y">
                    {d.alerts.map((a) => (
                      <li key={a.id} className="flex flex-col gap-1 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                        <span className="flex items-center gap-2">
                          <SeverityTag severity={a.severity} />
                          <span className={a.status === 'RESOLVED' ? 'text-muted-foreground line-through' : ''}>{a.message}</span>
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {fmtDateTime.format(new Date(a.startedAt))}
                          {a.resolvedAt ? ` → resuelta ${fmtDateTime.format(new Date(a.resolvedAt))}` : ' · activa'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

function HistoryChart({ title, empty, emptyText = 'Sin datos en este periodo.', children }: { title: string; empty: boolean; emptyText?: string; children: React.ReactElement }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      <div className="h-56">
        {empty ? (
          <p className="pt-20 text-center text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
