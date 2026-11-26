import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const ICON_COLORS = {
  blue: 'bg-blue-500',
  teal: 'bg-teal-500',
  purple: 'bg-purple-500',
  green: 'bg-green-500',
  amber: 'bg-amber-500',
  indigo: 'bg-indigo-500',
  cyan: 'bg-cyan-500',
  red: 'bg-red-500',
} as const

/** Tarjeta pequeña de la primera fila: título, ícono de color y contenido. */
export function KpiCard({
  title,
  icon: Icon,
  color,
  href,
  children,
}: {
  title: string
  icon: LucideIcon
  color: keyof typeof ICON_COLORS
  href?: string
  children: React.ReactNode
}) {
  const body = (
    <div className={cn('flex h-full flex-col rounded-lg border bg-white p-4 shadow-sm', href && 'transition-shadow hover:shadow-md')}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">{title}</span>
        <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white', ICON_COLORS[color])}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="flex-1 text-sm">{children}</div>
    </div>
  )
  return href ? (
    <Link href={href} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  )
}

export function BigValue({ value, caption }: { value: React.ReactNode; caption?: React.ReactNode }) {
  return (
    <div>
      <div className="text-xl font-bold text-gray-900">{value}</div>
      {caption && <div className="text-xs text-gray-600">{caption}</div>}
    </div>
  )
}

/** Fila con etiqueta, valor, porcentaje y barra de progreso. */
export function ProgressRow({
  label,
  value,
  total,
  color,
  labelClass,
}: {
  label: string
  value: number
  total: number
  color: string
  labelClass?: string
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between text-xs">
        <span className={cn('font-medium', labelClass)}>{label}</span>
        <span>
          <strong>{value}</strong> <span className="text-gray-400">{pct}%</span>
        </span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-gray-100">
        <div className={cn('h-1.5 rounded-full', color)} style={{ width: `${Math.max(pct, value > 0 ? 4 : 0)}%` }} />
      </div>
    </div>
  )
}

const GRADIENTS = {
  green: 'from-emerald-400 to-emerald-600',
  orange: 'from-amber-500 to-orange-600',
  blue: 'from-sky-400 to-indigo-500',
} as const

/** Tarjeta de color de la segunda fila (pagos, por cobrar, ingresos). */
export function GradientCard({
  title,
  value,
  caption,
  icon: Icon,
  color,
  href,
  children,
}: {
  title: string
  value: string
  caption: string
  icon: LucideIcon
  color: keyof typeof GRADIENTS
  href?: string
  children?: React.ReactNode
}) {
  const body = (
    <div className={cn('flex h-full min-h-[8.5rem] flex-col rounded-lg bg-gradient-to-br p-4 text-white shadow-sm', GRADIENTS[color])}>
      <div className="flex items-start justify-between">
        <span className="text-sm font-semibold">{title}</span>
        <Icon className="h-4 w-4 opacity-90" />
      </div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      <div className="text-xs font-medium opacity-90">{caption}</div>
      {children && <div className="mt-auto pt-3">{children}</div>}
    </div>
  )
  return href ? (
    <Link href={href} className="block h-full transition-opacity hover:opacity-95">
      {body}
    </Link>
  ) : (
    body
  )
}

/** Panel oscuro para los gráficos. */
export function DarkPanel({ title, actions, children }: { title: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-slate-800 p-4 text-slate-100 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  )
}
