import { cn } from '@/lib/utils'

/** Anillo de porcentaje (CPU, memoria, almacenamiento). */
export function Gauge({
  label,
  value,
  caption,
  warnAt = 75,
  dangerAt = 90,
}: {
  label: string
  value: number | null
  caption?: string
  warnAt?: number
  dangerAt?: number
}) {
  const v = value == null ? 0 : Math.min(100, Math.max(0, value))
  const r = 40
  const c = 2 * Math.PI * r
  const color = value == null ? '#d1d5db' : v >= dangerAt ? '#dc2626' : v >= warnAt ? '#f59e0b' : '#16a34a'
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <svg viewBox="0 0 100 100" className="h-24 w-24" role="img" aria-label={`${label}: ${value == null ? 'sin datos' : `${v}%`}`}>
        <circle cx="50" cy="50" r={r} fill="none" stroke="#f1f5f9" strokeWidth="10" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v / 100)}
          transform="rotate(-90 50 50)"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
        <text x="50" y="55" textAnchor="middle" className="fill-gray-900 text-[18px] font-bold">
          {value == null ? '—' : `${Math.round(v * 10) / 10}%`}
        </text>
      </svg>
      {caption && <span className="text-xs text-muted-foreground">{caption}</span>}
    </div>
  )
}

const STATUS: Record<string, { label: string; dot: string; badge: string }> = {
  ONLINE: { label: 'Conectado', dot: 'bg-green-500', badge: 'bg-green-100 text-green-800' },
  DEGRADED: { label: 'Con problemas', dot: 'bg-amber-500', badge: 'bg-amber-100 text-amber-800' },
  OFFLINE: { label: 'Desconectado', dot: 'bg-red-500', badge: 'bg-red-100 text-red-800' },
  UNKNOWN: { label: 'Sin datos aún', dot: 'bg-gray-400', badge: 'bg-gray-100 text-gray-700' },
}

export function RouterStatusBadge({ status, paused }: { status: string; paused?: boolean }) {
  const s = paused ? { label: 'Monitoreo pausado', dot: 'bg-gray-400', badge: 'bg-gray-100 text-gray-700' } : STATUS[status] ?? STATUS.UNKNOWN
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold', s.badge)}>
      <span className={cn('h-2 w-2 rounded-full', s.dot, status === 'ONLINE' && !paused && 'animate-pulse')} />
      {s.label}
    </span>
  )
}

const SEVERITY: Record<string, string> = {
  CRITICAL: 'border-red-200 bg-red-50 text-red-800',
  WARNING: 'border-amber-200 bg-amber-50 text-amber-800',
  INFO: 'border-blue-200 bg-blue-50 text-blue-800',
}
const SEVERITY_LABEL: Record<string, string> = { CRITICAL: 'Crítica', WARNING: 'Advertencia', INFO: 'Info' }

export function SeverityTag({ severity }: { severity: string }) {
  return <span className={cn('rounded border px-1.5 py-0.5 text-xs font-semibold', SEVERITY[severity])}>{SEVERITY_LABEL[severity] ?? severity}</span>
}

/** Dato con etiqueta; "No disponible" cuando el equipo no lo informa. */
export function Fact({ label, value, unavailable = 'No disponible en este equipo' }: { label: string; value: React.ReactNode; unavailable?: string }) {
  const empty = value === null || value === undefined || value === ''
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('truncate text-sm font-medium', empty && 'font-normal italic text-muted-foreground')}>{empty ? unavailable : value}</dd>
    </div>
  )
}

export function MiniStat({ label, value, hint, icon }: { label: string; value: React.ReactNode; hint?: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-white p-4 shadow-sm">
      {icon && <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">{icon}</div>}
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="truncate text-xl font-bold">{value}</div>
        {hint && <div className="truncate text-xs text-muted-foreground">{hint}</div>}
      </div>
    </div>
  )
}
