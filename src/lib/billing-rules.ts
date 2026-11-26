// Reglas de facturación puras (sin base de datos), para poder probarlas con tests.

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/** Primer día del mes (UTC) a partir de "YYYY-MM". */
export function parsePeriod(value: string): Date {
  const match = /^(\d{4})-(\d{2})$/.exec(value)
  if (!match) throw new Error('Periodo inválido, usa el formato AAAA-MM')
  const year = Number(match[1])
  const month = Number(match[2])
  if (month < 1 || month > 12 || year < 2000 || year > 2100) throw new Error('Periodo fuera de rango')
  return new Date(Date.UTC(year, month - 1, 1))
}

export function periodLabel(periodStart: Date) {
  return `${MONTHS[periodStart.getUTCMonth()]} ${periodStart.getUTCFullYear()}`
}

export function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000)
}

export function formatInvoiceNumber(prefix: string, sequence: number) {
  return `${prefix}-${String(sequence).padStart(6, '0')}`
}

/** Estado que debe tener una factura según lo pagado. Trabaja en centavos para evitar errores de redondeo. */
export function invoiceStatusAfterPayments(params: {
  amount: number
  approvedPaid: number
  dueDate: Date
  now?: Date
}): 'PAID' | 'PENDING' | 'OVERDUE' {
  const amountCents = Math.round(params.amount * 100)
  const paidCents = Math.round(params.approvedPaid * 100)
  if (paidCents >= amountCents) return 'PAID'
  return params.dueDate < startOfDayUTC(params.now ?? new Date()) ? 'OVERDUE' : 'PENDING'
}

export function startOfDayUTC(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}
