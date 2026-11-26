/**
 * Ciclos de facturación por zona (funciones puras, probadas con tests).
 *
 * Convención: las fechas de calendario se representan como medianoche UTC del día (igual que en
 * las facturas) y "ahora" se representa como la hora LOCAL de la empresa expresada en UTC
 * (ver localNow en dates.ts), para comparar sin errores de zona horaria.
 *
 * Reglas:
 * - El día de factura, de pago y de corte son días del mes. Si el mes no tiene ese día
 *   (p. ej. 30 en febrero), se usa el último día del mes.
 * - El límite de pago es la primera fecha con ese día en o después de la fecha de factura.
 * - El corte es la primera fecha con ese día en o después del límite de pago.
 *   Zona 30: factura 30-nov → pago hasta 30-nov → corte 5-dic. Así se respetan las fechas
 *   exactas de cada zona en lugar de sumar días.
 */

export type ZoneRules = {
  invoiceDay: number
  dueDay: number
  suspendDay: number
  invoiceHour: number
  suspendHour: number
}

const HOUR = 3_600_000
const DAY = 86_400_000

export function daysInMonth(year: number, month0: number) {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate()
}

/** Fecha con ese día del mes (ajustado al último día si el mes es más corto). Acepta meses fuera de rango. */
export function dateOn(year: number, month0: number, day: number) {
  const first = new Date(Date.UTC(year, month0, 1))
  const y = first.getUTCFullYear()
  const m = first.getUTCMonth()
  return new Date(Date.UTC(y, m, Math.min(day, daysInMonth(y, m))))
}

/** Primera fecha con ese día del mes en o después de `from`. */
export function onOrAfter(from: Date, day: number) {
  const same = dateOn(from.getUTCFullYear(), from.getUTCMonth(), day)
  return same >= from ? same : dateOn(from.getUTCFullYear(), from.getUTCMonth() + 1, day)
}

export function cycleDateIn(rules: Pick<ZoneRules, 'invoiceDay'>, year: number, month0: number) {
  return dateOn(year, month0, rules.invoiceDay)
}

export type CycleInfo = {
  /** Fecha de factura = inicio del periodo. */
  cycleDate: Date
  /** Fin del periodo (exclusivo) = fecha de factura del mes siguiente. */
  periodEnd: Date
  dueDate: Date
  suspendDate: Date
  /** Días entre el límite de pago y el corte. */
  graceDays: number
}

export function cycleInfo(rules: ZoneRules, cycleDate: Date): CycleInfo {
  const dueDate = onOrAfter(cycleDate, rules.dueDay)
  const suspendDate = onOrAfter(dueDate, rules.suspendDay)
  return {
    cycleDate,
    periodEnd: cycleDateIn(rules, cycleDate.getUTCFullYear(), cycleDate.getUTCMonth() + 1),
    dueDate,
    suspendDate,
    graceDays: Math.round((suspendDate.getTime() - dueDate.getTime()) / DAY),
  }
}

/** Último ciclo cuya hora de facturación ya llegó (el que corresponde facturar ahora). */
export function lastCycleStart(rules: ZoneRules, localNow: Date) {
  const y = localNow.getUTCFullYear()
  const m = localNow.getUTCMonth()
  const thisMonth = cycleDateIn(rules, y, m)
  return localNow.getTime() >= thisMonth.getTime() + rules.invoiceHour * HOUR ? thisMonth : cycleDateIn(rules, y, m - 1)
}

/** Próxima fecha de facturación todavía no alcanzada. */
export function nextCycleStart(rules: ZoneRules, localNow: Date) {
  const last = lastCycleStart(rules, localNow)
  return cycleDateIn(rules, last.getUTCFullYear(), last.getUTCMonth() + 1)
}

/** Próxima fecha de corte que aún no llegó (del ciclo actual o del siguiente). */
export function nextSuspendDate(rules: ZoneRules, localNow: Date) {
  const current = cycleInfo(rules, lastCycleStart(rules, localNow))
  if (localNow.getTime() < current.suspendDate.getTime() + rules.suspendHour * HOUR) return current.suspendDate
  return cycleInfo(rules, nextCycleStart(rules, localNow)).suspendDate
}

/** ¿Ya llegó el momento de cortar por una factura con esa fecha de corte? */
export function suspendTimeReached(suspendDate: Date, suspendHour: number, localNow: Date) {
  return localNow.getTime() >= suspendDate.getTime() + suspendHour * HOUR
}

/**
 * Regla de corte: el cliente se corta si tiene al menos `minInvoices` facturas impagas cuya
 * fecha de corte (con su hora) ya llegó. Las facturas pagadas o anuladas nunca cuentan.
 */
export function shouldSuspend(
  invoices: Array<{ status: string; suspendDate: Date | null }>,
  suspendHour: number,
  minInvoices: number,
  localNow: Date
) {
  const due = invoices.filter(
    (i) => (i.status === 'PENDING' || i.status === 'OVERDUE') && i.suspendDate && suspendTimeReached(i.suspendDate, suspendHour, localNow)
  )
  return due.length >= Math.max(1, minInvoices)
}

export function validateRules(r: { invoiceDay: number; dueDay: number; suspendDay: number; invoiceHour: number; suspendHour: number }) {
  const errors: Record<string, string> = {}
  const day = (v: number) => Number.isInteger(v) && v >= 1 && v <= 31
  const hour = (v: number) => Number.isInteger(v) && v >= 0 && v <= 23
  if (!day(r.invoiceDay)) errors.invoiceDay = 'Día entre 1 y 31'
  if (!day(r.dueDay)) errors.dueDay = 'Día entre 1 y 31'
  if (!day(r.suspendDay)) errors.suspendDay = 'Día entre 1 y 31'
  if (!hour(r.invoiceHour)) errors.invoiceHour = 'Hora entre 0 y 23'
  if (!hour(r.suspendHour)) errors.suspendHour = 'Hora entre 0 y 23'
  return errors
}
