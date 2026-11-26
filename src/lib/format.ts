type Numeric = number | { toNumber(): number } | null | undefined

/** Zona horaria para mostrar fechas y horas (la de la empresa por defecto). */
const DISPLAY_TZ = process.env.DEFAULT_TIMEZONE || 'America/Guayaquil'

export function toNumber(value: Numeric) {
  if (value == null) return 0
  return typeof value === 'number' ? value : value.toNumber()
}

/** Formato local de cada moneda (DOP → RD$1,234.50; USD → $1.234,50). */
export function currencyLocale(currency: string) {
  return currency === 'DOP' ? 'es-DO' : 'es-EC'
}

export function formatCurrency(value: Numeric, currency = 'USD') {
  return new Intl.NumberFormat(currencyLocale(currency), { style: 'currency', currency }).format(toNumber(value))
}

/** Fechas de calendario (emisión, vencimiento, pago): se guardan a medianoche UTC. */
export function formatDate(value: Date | string | null | undefined) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value))
}

/** Momentos concretos (creado, último acceso...): se muestran en la hora local de la empresa. */
export function formatDateTime(value: Date | string | null | undefined, timeZone = DISPLAY_TZ) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(new Date(value))
}

/** Solo el día de un momento concreto, en la hora local de la empresa. */
export function formatDay(value: Date | string | null | undefined, timeZone = DISPLAY_TZ) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium', timeZone }).format(new Date(value))
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat('es-EC').format(value)
}

/** Fecha de calendario (YYYY-MM-DD) para inputs type="date". */
export function toDateInput(value: Date | null | undefined) {
  return value ? new Date(value).toISOString().slice(0, 10) : ''
}
