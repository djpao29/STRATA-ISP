'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { usePolling } from '@/components/monitoring/use-polling'
import { MiniStat } from '@/components/monitoring/widgets'
import { formatBps, formatBytes, formatUptime } from '@/lib/monitoring/units'
import { cn } from '@/lib/utils'

type Client = {
  serviceId: string
  customerId: string
  customer: string
  plan: string
  planSpeed: string
  mode: 'PPPoE' | 'DHCP' | 'STATIC_IP'
  user: string | null
  online: boolean | null
  address: string | null
  callerId: string | null
  uptimeSec: number | null
  profile: string | null
  lastLoggedOut: string | null
  downBps: number | null
  upBps: number | null
  downBytes: number | null
  upBytes: number | null
  detection: 'ppp' | 'arp' | 'no_ip' | 'unavailable'
}
type Unlinked = { user: string; address: string | null; callerId: string | null; uptimeSec: number; service: string; profile: string | null; downBps: number | null; upBps: number | null }
type Data = {
  pppAvailable: boolean
  queuesAvailable: boolean
  totals: { activeSessions: number | null; registered: number; online: number; offline: number }
  clients: Client[]
  unlinked: Unlinked[]
}

export function ClientsPanel({ routerId }: { routerId: string }) {
  const { data, error, loading } = usePolling<Data>(`/api/monitoring/routers/${routerId}/clients`, 15_000)
  const [filter, setFilter] = useState<'all' | 'online' | 'offline' | 'static'>('all')

  if (!data) return <p className="text-sm text-muted-foreground">{error ?? (loading ? 'Consultando al router…' : 'Sin datos')}</p>

  const rows = data.clients.filter((c) =>
    filter === 'online' ? c.online === true : filter === 'offline' ? c.online === false : filter === 'static' ? c.mode !== 'PPPoE' : true
  )

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MiniStat label="Sesiones activas en el router" value={data.totals.activeSessions ?? 'N/D'} hint={data.pppAvailable ? undefined : 'PPP no disponible en este equipo'} />
        <MiniStat label="Clientes del sistema en este router" value={data.totals.registered} />
        <MiniStat label="Conectados" value={data.totals.online} />
        <MiniStat label="Desconectados" value={data.totals.offline} />
      </div>

      {!data.queuesAvailable && (
        <p className="rounded-md border bg-gray-50 px-3 py-2 text-xs text-muted-foreground">
          El consumo por cliente se lee de las colas simples del router (las que crean los perfiles PPP con límite de velocidad). Este router no tiene colas simples, así que el consumo por cliente no está disponible.
        </p>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Clientes asignados a este router</CardTitle>
          <div className="flex flex-wrap gap-1">
            {([['all', 'Todos'], ['online', 'Conectados'], ['offline', 'Desconectados'], ['static', 'IP estática / DHCP']] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setFilter(k)} className={cn('rounded-full border px-3 py-1 text-xs', filter === k ? 'border-blue-600 bg-blue-50 text-blue-700' : 'text-muted-foreground')}>
                {l}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {data.clients.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Ningún servicio del sistema está asignado a este router. Asigna el router y el usuario PPPoE (o la IP) en la ficha de cada cliente.
            </p>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Conexión</th>
                    <th>Estado</th>
                    <th>IP / MAC</th>
                    <th>Tiempo conectado</th>
                    <th>Perfil / plan</th>
                    <th>↓ Actual</th>
                    <th>↑ Actual</th>
                    <th>Consumo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {rows.map((c) => (
                    <tr key={c.serviceId}>
                      <td>
                        <Link href={`/dashboard/customers/${c.customerId}`} className="font-medium text-blue-700 hover:underline">{c.customer}</Link>
                        {c.user && <div className="text-xs text-muted-foreground">{c.user}</div>}
                      </td>
                      <td>{c.mode === 'PPPoE' ? 'PPPoE' : c.mode === 'DHCP' ? 'DHCP' : 'IP estática'}</td>
                      <td>
                        <Presence c={c} />
                      </td>
                      <td>
                        {c.address ?? '—'}
                        {c.callerId && <div className="font-mono text-xs text-muted-foreground">{c.callerId}</div>}
                      </td>
                      <td>{c.uptimeSec != null ? formatUptime(c.uptimeSec) : c.online === false && c.lastLoggedOut ? <span className="text-xs">Última: {c.lastLoggedOut}</span> : '—'}</td>
                      <td>
                        {c.profile ?? '—'}
                        <div className="text-xs text-muted-foreground">{c.plan} · {c.planSpeed}</div>
                      </td>
                      <td>{formatBps(c.downBps)}</td>
                      <td>{formatBps(c.upBps)}</td>
                      <td className="text-xs">{c.downBytes != null ? `↓ ${formatBytes(c.downBytes)} · ↑ ${formatBytes(c.upBytes)}` : 'N/D'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {data.unlinked.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sesiones PPP activas sin cliente en el sistema ({data.unlinked.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-xs text-muted-foreground">
              Usuarios conectados al router que no coinciden con el &quot;Usuario PPPoE&quot; de ningún servicio registrado. Regístralos para llevar su facturación.
            </p>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Usuario</th>
                    <th>Servicio</th>
                    <th>IP</th>
                    <th>MAC</th>
                    <th>Tiempo conectado</th>
                    <th>Perfil</th>
                    <th>↓ Actual</th>
                    <th>↑ Actual</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {data.unlinked.map((u) => (
                    <tr key={u.user}>
                      <td className="font-medium">{u.user}</td>
                      <td>{u.service}</td>
                      <td>{u.address ?? '—'}</td>
                      <td className="font-mono text-xs">{u.callerId ?? '—'}</td>
                      <td>{formatUptime(u.uptimeSec)}</td>
                      <td>{u.profile ?? '—'}</td>
                      <td>{formatBps(u.downBps)}</td>
                      <td>{formatBps(u.upBps)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
      {error && <p className="text-xs text-red-600">Última consulta con error: {error}</p>}
    </div>
  )
}

function Presence({ c }: { c: Client }) {
  if (c.detection === 'unavailable') return <span className="text-xs text-muted-foreground">PPP no disponible</span>
  if (c.detection === 'no_ip') return <span className="text-xs text-muted-foreground">Sin IP registrada: no se puede detectar</span>
  return (
    <span className={cn('inline-flex items-center gap-1 text-sm', c.online ? 'text-green-700' : 'text-red-600')}>
      <span className={cn('h-2 w-2 rounded-full', c.online ? 'bg-green-500' : 'bg-red-500')} />
      {c.online ? 'Conectado' : 'Desconectado'}
      {c.detection === 'arp' && <span className="text-[10px] text-muted-foreground">(ARP)</span>}
    </span>
  )
}
