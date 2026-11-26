import { describe, expect, it } from 'vitest'
import {
  addDays,
  formatInvoiceNumber,
  invoiceStatusAfterPayments,
  parsePeriod,
  periodLabel,
  startOfDayUTC,
} from './billing-rules'

describe('parsePeriod', () => {
  it('devuelve el primer día del mes en UTC', () => {
    expect(parsePeriod('2026-11').toISOString()).toBe('2026-11-01T00:00:00.000Z')
    expect(parsePeriod('2026-01').toISOString()).toBe('2026-01-01T00:00:00.000Z')
  })

  it('rechaza formatos y meses inválidos', () => {
    expect(() => parsePeriod('2026-13')).toThrow()
    expect(() => parsePeriod('2026-00')).toThrow()
    expect(() => parsePeriod('11-2026')).toThrow()
    expect(() => parsePeriod('')).toThrow()
  })
})

describe('periodLabel', () => {
  it('nombra el mes en español', () => {
    expect(periodLabel(parsePeriod('2026-11'))).toBe('noviembre 2026')
  })
})

describe('formatInvoiceNumber', () => {
  it('rellena con ceros a 6 dígitos', () => {
    expect(formatInvoiceNumber('F', 1)).toBe('F-000001')
    expect(formatInvoiceNumber('FAC', 1234567)).toBe('FAC-1234567')
  })
})

describe('addDays / startOfDayUTC', () => {
  it('suma días y normaliza al inicio del día', () => {
    expect(addDays(new Date('2026-11-25T00:00:00Z'), 10).toISOString()).toBe('2026-12-05T00:00:00.000Z')
    expect(startOfDayUTC(new Date('2026-11-25T18:45:10Z')).toISOString()).toBe('2026-11-25T00:00:00.000Z')
  })
})

describe('invoiceStatusAfterPayments', () => {
  const now = new Date('2026-11-25T12:00:00Z')
  const future = new Date('2026-12-05T00:00:00Z')
  const past = new Date('2026-11-10T00:00:00Z')

  it('PAID cuando lo pagado cubre el total', () => {
    expect(invoiceStatusAfterPayments({ amount: 25, approvedPaid: 25, dueDate: future, now })).toBe('PAID')
    expect(invoiceStatusAfterPayments({ amount: 25, approvedPaid: 30, dueDate: past, now })).toBe('PAID')
  })

  it('evita errores de coma flotante (0.1 + 0.2)', () => {
    expect(invoiceStatusAfterPayments({ amount: 0.3, approvedPaid: 0.1 + 0.2, dueDate: future, now })).toBe('PAID')
  })

  it('PENDING con saldo y sin vencer; OVERDUE con saldo y vencida', () => {
    expect(invoiceStatusAfterPayments({ amount: 25, approvedPaid: 10, dueDate: future, now })).toBe('PENDING')
    expect(invoiceStatusAfterPayments({ amount: 25, approvedPaid: 0, dueDate: past, now })).toBe('OVERDUE')
  })

  it('el día del vencimiento todavía no está vencida', () => {
    const today = new Date('2026-11-25T00:00:00Z')
    expect(invoiceStatusAfterPayments({ amount: 25, approvedPaid: 0, dueDate: today, now })).toBe('PENDING')
  })
})
