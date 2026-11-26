import { cn } from '@/lib/utils'

const green = 'bg-green-100 text-green-800'
const red = 'bg-red-100 text-red-800'
const yellow = 'bg-yellow-100 text-yellow-800'
const gray = 'bg-gray-100 text-gray-800'
const blue = 'bg-blue-100 text-blue-800'
const orange = 'bg-orange-100 text-orange-800'

const STATUS: Record<string, [string, string]> = {
  // Clientes
  ACTIVE: ['Activo', green],
  SUSPENDED: ['Suspendido', red],
  CANCELLED: ['Cancelado', gray],
  PENDING: ['Pendiente', yellow],
  // Facturas
  PAID: ['Pagada', green],
  OVERDUE: ['Vencida', red],
  // Pagos
  APPROVED: ['Aprobado', green],
  REJECTED: ['Rechazado', red],
  REVERSED: ['Reversado', gray],
  // Equipos
  ONLINE: ['En línea', green],
  OFFLINE: ['Desconectado', gray],
  WARNING: ['Advertencia', yellow],
  ERROR: ['Error', red],
  // Tickets
  OPEN: ['Abierto', blue],
  IN_PROGRESS: ['En progreso', yellow],
  RESOLVED: ['Resuelto', green],
  CLOSED: ['Cerrado', gray],
  // Prioridad
  LOW: ['Baja', gray],
  MEDIUM: ['Media', blue],
  HIGH: ['Alta', orange],
  URGENT: ['Urgente', red],
  UNKNOWN: ['Sin verificar', gray],
  // ONU
  INACTIVE: ['Inactiva', gray],
  LOS: ['Sin señal (LOS)', red],
}

export function statusLabel(value: string) {
  return STATUS[value]?.[0] ?? value
}

export function StatusBadge({ value, className }: { value: string; className?: string }) {
  const [label, color] = STATUS[value] ?? [value, gray]
  return (
    <span
      className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', color, className)}
    >
      {label}
    </span>
  )
}
