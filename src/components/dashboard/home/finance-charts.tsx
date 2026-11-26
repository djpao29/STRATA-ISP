'use client'

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { currencyLocale } from '@/lib/format'

/** Ingresos vs. gastos por mes. */
export function IncomeExpensesChart({ data, currency }: { data: Array<{ month: string; ingresos: number; gastos: number }>; currency: string }) {
  const fmt = (v: number) => new Intl.NumberFormat(currencyLocale(currency), { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(v)
  const full = (v: number) => new Intl.NumberFormat(currencyLocale(currency), { style: 'currency', currency }).format(v)
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="month" fontSize={11} tickLine={false} axisLine={false} />
          <YAxis fontSize={11} tickLine={false} axisLine={false} width={64} tickFormatter={fmt} />
          <Tooltip formatter={(v: number, n: string) => [full(v), n === 'ingresos' ? 'Ingresos' : 'Gastos']} />
          <Legend formatter={(v) => (v === 'ingresos' ? 'Ingresos' : 'Gastos')} />
          <Bar dataKey="ingresos" fill="#16a34a" radius={[3, 3, 0, 0]} />
          <Bar dataKey="gastos" fill="#dc2626" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Cobros por día del mes en curso. */
export function DailyCollectionsChart({ data, currency }: { data: Array<{ day: string; cobrado: number }>; currency: string }) {
  const fmt = (v: number) => new Intl.NumberFormat(currencyLocale(currency), { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(v)
  const full = (v: number) => new Intl.NumberFormat(currencyLocale(currency), { style: 'currency', currency }).format(v)
  return (
    <div className="h-60">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="day" fontSize={11} tickLine={false} axisLine={false} />
          <YAxis fontSize={11} tickLine={false} axisLine={false} width={64} tickFormatter={fmt} />
          <Tooltip formatter={(v: number) => [full(v), 'Cobrado']} labelFormatter={(d) => `Día ${d}`} />
          <Bar dataKey="cobrado" fill="#2563eb" radius={[3, 3, 0, 0]} minPointSize={1} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Barras horizontales simples para desgloses. */
export function Breakdown({ rows, currency, color }: { rows: Array<{ name: string; amount: number }>; currency: string; color: string }) {
  const max = Math.max(1, ...rows.map((r) => r.amount))
  const fmt = (v: number) => new Intl.NumberFormat(currencyLocale(currency), { style: 'currency', currency }).format(v)
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Sin movimientos en el periodo.</p>
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.name} className="text-sm">
          <div className="flex justify-between gap-2">
            <span className="truncate">{r.name}</span>
            <span className="font-medium">{fmt(r.amount)}</span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-gray-100">
            <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${(r.amount / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}
