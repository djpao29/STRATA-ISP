'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { usePolling } from '@/components/monitoring/use-polling'
import { MiniStat } from '@/components/monitoring/widgets'
import { formatBps, formatBytes, formatUptime } from '@/lib/monitoring/units'
import { cn } from '@/lib/utils'
const formatCustomerCode = (code: number) => `C-${String(code).padStart(6, '0')}`

type Row = {
  serviceId: string
  customerId: string | null
  customerCode: number | null
  customer: string | null
  plan: string | null
  planSpeed: string | null
  mode: string
  user: string | null
  online: boolean | null
  address: string | null
  uptimeSec: number | null
  downBps: number | null
  upBps: number | null
  downBytes: number | null
  upBytes: number | null
  router: string
  linked: boolean
}
type Data = { at: string; routers: Array<{ id: string; name: string; ok: boolean; error: string | null; queues: boolean }>; rows: Row[] }

const SORTS = {
  down: (a: Row, b: Row) => (b.downBps ?? -1) - (a.downBps ?? -1),
  up: (a: Row, b: Row) => (b.upBps ?? -1) - (a.upBps ?? -1),
  total: (a: Row, b: Row) => (b.downBytes ?? -1) - (a.downBytes ?? -1),
  name: (a: Row, b: Row) => (a.customer ?? a.user ?? '').localeCompare(b.customer ?? b.user ?? '', 'es'),
}

export function TrafficClient() {
  const { data, error, updatedAt } = usePolling<Data>('/api/customers/traffic', 15_000)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | 'online' | 'offline' | 'unlinked'>('all')
  const [sort, setSort] = useState<keyof typeof SORTS>('down')

  const rows = useMemo(() => {
    let r = data?.rows ?? []
    if (q) r = r.filter((x) => [x.customer, x.user, x.address, x.router].some((v) => v?.toLowerCase().includes(q.toLowerCase())))
    if (filter === 'online') r = r.filter((x) => x.online === true)
    if (filter === 'offline') r = r.filter((x) => x.online === false)
    if (filter === 'unlinked') r = r.filter((x) => !x.linked)
    return [...r].sort(SORTS[sort])
  }, [data, q, filter, sort])

  if (!data) return <p className="text-sm text-muted-foreground">{error ?? 'Consultando los routers…'}</p>

  const all = data.rows
  const down = all.reduce((s, r) => s + (r.downBps ?? 0), 0)
  const up = all.reduce((s, r) => s + (r.upBps ?? 0), 0)
  const noQueues = data.routers.filter((r) => r.ok && !r.queues)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MiniStat label="Conectados ahora" value={all.filter((r) => r.online === true).length} />
        <MiniStat label="Desconectados" value={all.filter((r) => r.online === false).length} />
        <MiniStat label="Bajada total (clientes)" value={<span className="flex items-center text-base"><ArrowDown className="h-4 w-4 text-blue-600" />{formatBps(down)}</span>} />
        <MiniStat label="Subida total (clientes)" value={<span className="flex items-center text-base"><ArrowUp className="h-4 w-4 text-green-600" />{formatBps(up)}</span>} />
      </div>

      {data.routers.length === 0 && (
        <p className="rounded-md border bg-gray-50 px-3 py-2 text-sm">No hay routers MikroTik con monitoreo activo. <Link href="/dashboard/routers" className="text-blue-700 underline">Registrar un router</Link></p>
      )}
      {data.routers.filter((r) => !r.ok).map((r) => (
        <p key={r.id} className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{r.name}: {r.error}</p>
      ))}
      {noQueues.length > 0 && (
        <p className="rounded-md border bg-gray-50 px-3 py-2 text-xs text-muted-foreground">
          {noQueues.map((r) => r.name).join(', ')}: sin colas simples, por eso no hay velocidad ni consumo por cliente (solo conexión). Se muestran cuando los perfiles PPP o las colas limitan la velocidad de cada cliente.
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente, usuario PPPoE, IP o router" className="flex h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm" />
        <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
          <option value="all">Todos</option>
          <option value="online">Conectados</option>
          <option value="offline">Desconectados</option>
          <option value="unlinked">Sesiones sin cliente en el sistema</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as keyof typeof SORTS)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
          <option value="down">Más bajada ahora</option>
          <option value="up">Más subida ahora</option>
          <option value="total">Más consumo acumulado</option>
          <option value="name">Nombre</option>
        </select>
      </div>

      <Card>
        <CardContent className="pt-6">
          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Sin resultados.</p>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Estado</th>
                    <th>IP</th>
                    <th>Conectado</th>
                    <th>Plan / perfil</th>
                    <th>Router</th>
                    <th>↓ Ahora</th>
                    <th>↑ Ahora</th>
                    <th>Consumo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {rows.map((r) => (
                    <tr key={r.serviceId}>
                      <td>
                        {r.customerId ? (
                          <Link href={`/dashboard/customers/${r.customerId}`} className="font-medium text-blue-700 hover:underline">{r.customer}</Link>
                        ) : (
                          <span className="text-muted-foreground">Sin cliente en el sistema</span>
                        )}
                        <div className="text-xs text-muted-foreground">
                          {r.customerCode ? `${formatCustomerCode(r.customerCode)} · ` : ''}
                          {r.user ?? r.mode}
                        </div>
                      </td>
                      <td>
                        {r.online === null ? (
                          <span className="text-xs text-muted-foreground">Sin IP para detectar</span>
                        ) : (
                          <span className={cn('inline-flex items-center gap-1', r.online ? 'text-green-700' : 'text-red-600')}>
                            <span className={cn('h-2 w-2 rounded-full', r.online ? 'bg-green-500' : 'bg-red-500')} />
                            {r.online ? 'Conectado' : 'Desconectado'}
                          </span>
                        )}
                      </td>
                      <td className="font-mono text-xs">{r.address ?? '—'}</td>
                      <td>{r.uptimeSec != null ? formatUptime(r.uptimeSec) : '—'}</td>
                      <td>
                        {r.plan ?? '—'}
                        {r.planSpeed && <div className="text-xs text-muted-foreground">{r.planSpeed}</div>}
                      </td>
                      <td>{r.router}</td>
                      <td className="font-medium">{formatBps(r.downBps)}</td>
                      <td>{formatBps(r.upBps)}</td>
                      <td className="text-xs">{r.downBytes != null ? `↓ ${formatBytes(r.downBytes)} · ↑ ${formatBytes(r.upBytes)}` : 'N/D'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Actualizado {updatedAt ? updatedAt.toLocaleTimeString('es-DO') : '—'} · se refresca cada 15 s{error ? ` · ${error}` : ''}
      </p>
    </div>
  )
}
