'use client'

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const AXIS = { stroke: '#64748b', fontSize: 11, tickLine: false, axisLine: false }

/** ONUs autorizadas por mes del año. */
export function AuthorizedChart({ data }: { data: Array<{ month: string; total: number }> }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="month" {...AXIS} />
        <YAxis allowDecimals={false} {...AXIS} />
        <Tooltip formatter={(v: number) => [v, 'ONUs']} cursor={{ fill: 'rgba(16,185,129,0.08)' }} />
        <Bar dataKey="total" fill="#10b981" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Distribución de señal recibida (Salud de red). */
export function SignalChart({ data }: { data: Array<{ range: string; total: number; level: 'good' | 'low' | 'critical' }> }) {
  const color = { good: '#10b981', low: '#f59e0b', critical: '#ef4444' }
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="range" {...AXIS} />
        <YAxis allowDecimals={false} {...AXIS} />
        <Tooltip formatter={(v: number) => [v, 'ONUs']} />
        <Bar dataKey="total" radius={[4, 4, 0, 0]}>
          {data.map((d) => (
            <Cell key={d.range} fill={color[d.level]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
