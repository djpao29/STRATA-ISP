import type { ONUStatus, PonEventKind } from '@prisma/client'

export const ONU_STATUS_LABEL: Record<ONUStatus, string> = {
  ACTIVE: 'En línea',
  INACTIVE: 'Desactivada',
  LOS: 'Fuera de línea (LOS)',
  POWER_OFF: 'Sin energía',
  OFFLINE: 'Fuera de línea',
  UNKNOWN: 'Sin leer',
}

export const EVENT_LABEL: Record<PonEventKind, string> = {
  SIGNAL_VARIATION: 'Signal variations',
  POWER_OFF: 'Sin energía',
  LOS: 'LOS parcial',
  PON_DOWN: 'PON completa caída',
  OFFLINE: 'Offline N/A',
}
