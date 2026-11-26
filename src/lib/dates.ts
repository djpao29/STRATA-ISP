/**
 * Las fechas "de calendario" (emisión, vencimiento, fecha de pago) se guardan como medianoche UTC
 * del día correspondiente. "Hoy" debe calcularse en la zona horaria de la empresa: a las 20:00 en
 * Ecuador ya es el día siguiente en UTC.
 */
export function todayIn(timeZone: string, now = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value)
  return new Date(Date.UTC(get('year'), get('month') - 1, get('day')))
}

/** Primer día del mes actual en la zona horaria de la empresa. */
export function monthStartIn(timeZone: string, now = new Date()): Date {
  const today = todayIn(timeZone, now)
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
}

/** "YYYY-MM" del mes actual en la zona horaria de la empresa. */
export function currentPeriodIn(timeZone: string, now = new Date()) {
  return todayIn(timeZone, now).toISOString().slice(0, 7)
}
