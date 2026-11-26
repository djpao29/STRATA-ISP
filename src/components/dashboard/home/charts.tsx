'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { currencyLocale } from '@/lib/format'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const AXIS = { stroke: '#64748b', fontSize: 11, tickLine: false, axisLine: false }
const GRID = { stroke: '#334155', strokeDasharray: '3 3', vertical: false }
const TOOLTIP = {
  contentStyle: { background: '#0f172a', border: '1px solid #334155', borderRadius: 6, color: '#e2e8f0', fontSize: 12 },
  labelStyle: { color: '#94a3b8' },
  cursor: { fill: 'rgba(148,163,184,0.08)' },
}

/** Selector de periodo (6 o 12 meses) que cambia el parámetro ?months= de la URL. */
export function MonthsSelect({ value }: { value: number }) {
  const router = useRouter()
  const params = useSearchParams()
  return (
    <select
      aria-label="Periodo"
      value={value}
      onChange={(e) => {
        const sp = new URLSearchParams(params.toString())
        sp.set('months', e.target.value)
        router.push(`/dashboard?${sp.toString()}`, { scroll: false })
      }}
      className="h-7 rounded border border-slate-600 bg-slate-900 px-2 text-xs text-slate-100"
    >
      <option value={6}>6 meses</option>
      <option value={12}>12 meses</option>
    </select>
  )
}

/** Barras de cobros por mes, con el monto bajo cada mes. */
export function CollectionsChart({ data, currency }: { data: Array<{ month: string; cobrado: number }>; currency: string }) {
  const short = (v: number) =>
    new Intl.NumberFormat(currencyLocale(currency), { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(v)
  const full = (v: number) => new Intl.NumberFormat(currencyLocale(currency), { style: 'currency', currency }).format(v)
  const rows = data.map((d) => ({ ...d, label: d.month.split(' ')[0] }))
  return (
    <div>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="label" {...AXIS} />
            <YAxis {...AXIS} width={64} tickFormatter={short} allowDecimals={false} />
            <Tooltip {...TOOLTIP} formatter={(v: number) => [full(v), 'Cobrado']} labelFormatter={(_, p) => p?.[0]?.payload?.month ?? ''} />
            <Bar dataKey="cobrado" fill="#3b82f6" radius={[3, 3, 0, 0]} minPointSize={2} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 grid text-center text-[10px] text-slate-300" style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}>
        {rows.map((r) => (
          <span key={r.month} className="truncate font-semibold">
            {short(r.cobrado)}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Línea de altas de clientes por mes. */
export function GrowthChart({ data }: { data: Array<{ month: string; altas: number }> }) {
  return (
    <div>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="month" {...AXIS} />
            <YAxis {...AXIS} allowDecimals={false} width={40} />
            <Tooltip {...TOOLTIP} formatter={(v: number) => [v, 'Altas']} />
            <Line type="monotone" dataKey="altas" stroke="#2dd4bf" strokeWidth={2} dot={{ r: 2, fill: '#2dd4bf' }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 grid text-center text-[10px] font-semibold text-slate-300" style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}>
        {data.map((r, i) => (
          <span key={`${r.month}-${i}`}>{r.altas}</span>
        ))}
      </div>
    </div>
  )
}
