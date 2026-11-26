'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { ActionForm, SubmitButton } from '@/components/forms/action-form'
import { formatBps, formatBytes } from '@/lib/monitoring/units'
import { cn } from '@/lib/utils'
import { updateInterface } from '../actions'

export type Iface = {
  id: string
  name: string
  type: string
  comment: string | null
  role: 'WAN' | 'LAN' | 'OTHER'
  isSfp: boolean
  monitored: boolean
  alertOnDown: boolean
  running: boolean
  disabled: boolean
  missing: boolean
  rxBytes: number
  txBytes: number
  rxBps: number
  txBps: number
}

const FILTERS = [
  { key: 'all', label: 'Todas' },
  { key: 'wan', label: 'WAN' },
  { key: 'lan', label: 'LAN' },
  { key: 'sfp', label: 'SFP / SFP+' },
  { key: 'up', label: 'Con enlace' },
  { key: 'down', label: 'Sin enlace' },
] as const

export function InterfacesTable({ interfaces, onSaved, onSelect }: { interfaces: Iface[]; onSaved: () => void; onSelect: (name: string) => void }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('all')
  const [editing, setEditing] = useState<string | null>(null)

  const rows = interfaces.filter((i) => {
    switch (filter) {
      case 'wan': return i.role === 'WAN'
      case 'lan': return i.role === 'LAN'
      case 'sfp': return i.isSfp
      case 'up': return i.running
      case 'down': return !i.running
      default: return true
    }
  })

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn('rounded-full border px-3 py-1 text-xs', filter === f.key ? 'border-blue-600 bg-blue-50 text-blue-700' : 'text-muted-foreground')}
            >
              {f.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Velocidades: promedio del último ciclo de recolección. Totales: contadores del router desde su último reinicio. Pulsa un nombre para verlo en el gráfico en vivo.
        </p>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Interfaz</th>
                <th>Tipo</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>↓ RX</th>
                <th>↑ TX</th>
                <th>Total RX</th>
                <th>Total TX</th>
                <th>Historial / alerta</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-center text-muted-foreground">Ninguna interfaz en este filtro.</td>
                </tr>
              )}
              {rows.map((i) => (
                <tr key={i.id} className={i.missing ? 'opacity-50' : ''}>
                  <td>
                    <button type="button" onClick={() => onSelect(i.name)} className="font-medium text-blue-700 hover:underline">
                      {i.name}
                    </button>
                    {i.isSfp && <span className="ml-1 rounded bg-purple-100 px-1 text-[10px] font-semibold text-purple-700">SFP</span>}
                    {i.comment && <div className="max-w-[16rem] truncate text-xs text-muted-foreground">{i.comment}</div>}
                  </td>
                  <td>{i.type}</td>
                  <td>
                    {i.role === 'OTHER' ? '—' : (
                      <span className={cn('rounded px-1.5 py-0.5 text-xs font-semibold', i.role === 'WAN' ? 'bg-orange-100 text-orange-700' : 'bg-sky-100 text-sky-700')}>
                        {i.role}
                      </span>
                    )}
                  </td>
                  <td>
                    {i.missing ? 'Eliminada' : i.disabled ? 'Deshabilitada' : (
                      <span className={cn('inline-flex items-center gap-1', i.running ? 'text-green-700' : 'text-red-600')}>
                        <span className={cn('h-2 w-2 rounded-full', i.running ? 'bg-green-500' : 'bg-red-500')} />
                        {i.running ? 'Con enlace' : 'Sin enlace'}
                      </span>
                    )}
                  </td>
                  <td>{formatBps(i.rxBps)}</td>
                  <td>{formatBps(i.txBps)}</td>
                  <td>{formatBytes(i.rxBytes)}</td>
                  <td>{formatBytes(i.txBytes)}</td>
                  <td className="text-xs">
                    {i.monitored ? 'Guarda historial' : '—'}
                    {i.alertOnDown && <div className="text-amber-700">Alerta si cae</div>}
                  </td>
                  <td className="text-right">
                    {editing === i.id ? (
                      <ActionForm
                        action={async (s, f) => {
                          const r = await updateInterface(s, f)
                          if (r.ok) {
                            setEditing(null)
                            onSaved()
                          }
                          return r
                        }}
                        className="flex flex-col items-end gap-1 space-y-0 text-left"
                      >
                        <input type="hidden" name="id" value={i.id} />
                        <select name="role" defaultValue={i.role} className="h-8 rounded-md border border-input px-2 text-xs">
                          <option value="WAN">WAN</option>
                          <option value="LAN">LAN</option>
                          <option value="OTHER">Otra</option>
                        </select>
                        <label className="flex items-center gap-1 text-xs">
                          <input type="checkbox" name="monitored" defaultChecked={i.monitored} /> Guardar historial
                        </label>
                        <label className="flex items-center gap-1 text-xs">
                          <input type="checkbox" name="alertOnDown" defaultChecked={i.alertOnDown} /> Alertar si cae
                        </label>
                        <span className="flex gap-1">
                          <button type="button" className="text-xs text-muted-foreground" onClick={() => setEditing(null)}>Cancelar</button>
                          <SubmitButton size="sm">Guardar</SubmitButton>
                        </span>
                      </ActionForm>
                    ) : (
                      <button type="button" className="text-xs text-blue-700 hover:underline" onClick={() => setEditing(i.id)}>
                        Configurar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
