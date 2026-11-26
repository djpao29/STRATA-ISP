import type { ONUStatus, OltBrand, OnuAuthState } from '@prisma/client'
import { cn } from '@/lib/utils'
import { ONU_STATUS_LABEL } from '@/lib/olt/labels'

export const BRAND_LABEL: Record<OltBrand, string> = { HUAWEI: 'Huawei', ZTE: 'ZTE', VSOL: 'VSOL' }
export const AUTH_LABEL: Record<OnuAuthState, string> = {
  AUTHORIZED: 'Autorizada',
  PREAUTHORIZED: 'Pre-autorizada',
  PENDING: 'En cola',
  FAILED: 'Falló',
}

const STATUS_CLS: Record<ONUStatus, string> = {
  ACTIVE: 'bg-green-100 text-green-800',
  INACTIVE: 'bg-gray-100 text-gray-700',
  LOS: 'bg-red-100 text-red-800',
  POWER_OFF: 'bg-amber-100 text-amber-800',
  OFFLINE: 'bg-red-50 text-red-700',
  UNKNOWN: 'bg-gray-100 text-gray-600',
}

export function OnuStatus({ status }: { status: ONUStatus }) {
  return <span className={cn('whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', STATUS_CLS[status])}>{ONU_STATUS_LABEL[status]}</span>
}

/** Señal recibida con color según los umbrales configurados. */
export function RxPower({ value, low, critical }: { value: number | null; low: number; critical: number }) {
  if (value == null) return <span className="text-xs text-muted-foreground">—</span>
  const cls = value <= critical ? 'text-red-700' : value <= low ? 'text-amber-700' : 'text-green-700'
  return <span className={cn('font-mono text-xs font-semibold', cls)}>{value.toFixed(2)} dBm</span>
}

export function fmtUptime(sec: number | null) {
  if (sec == null) return '—'
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`
}

export const pon = (frame: number, slot: number, port: number, id?: number | null) => `${frame}/${slot}/${port}${id != null ? `:${id}` : ''}`
