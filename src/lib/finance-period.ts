import { monthStartIn } from '@/lib/dates'

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** Mes elegido en la URL (?month=2026-11) o el actual de la empresa: [inicio, fin) en fechas de calendario. */
export function monthRange(value: string | undefined, timeZone: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(value ?? '')
  const start = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)) : monthStartIn(timeZone)
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1))
  return {
    start,
    end,
    key: start.toISOString().slice(0, 7),
    label: `${MONTHS[start.getUTCMonth()]} ${start.getUTCFullYear()}`,
    prev: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1)).toISOString().slice(0, 7),
    next: end.toISOString().slice(0, 7),
  }
}
