import { describe, expect, it } from 'vitest'
import { cycleInfo, dateOn, lastCycleStart, nextCycleStart, nextSuspendDate, shouldSuspend } from './cycle'

const d = (s: string) => new Date(`${s}T00:00:00.000Z`)
const at = (s: string) => new Date(`${s}Z`) // hora local de la empresa expresada en UTC
const iso = (x: Date) => x.toISOString().slice(0, 10)

const ZONA_15 = { invoiceDay: 15, dueDay: 15, suspendDay: 20, invoiceHour: 0, suspendHour: 0 }
const ZONA_30 = { invoiceDay: 30, dueDay: 30, suspendDay: 5, invoiceHour: 0, suspendHour: 0 }

describe('Zona 15', () => {
  it('factura el 15, paga hasta el 15, corte el 20, 5 días de gracia', () => {
    const c = cycleInfo(ZONA_15, d('2026-11-15'))
    expect([iso(c.cycleDate), iso(c.dueDate), iso(c.suspendDate), iso(c.periodEnd), c.graceDays]).toEqual([
      '2026-11-15', '2026-11-15', '2026-11-20', '2026-12-15', 5,
    ])
  })

  it('ciclo vigente y próximas fechas según el día', () => {
    expect(iso(lastCycleStart(ZONA_15, at('2026-11-14T23:59:00')))).toBe('2026-10-15')
    expect(iso(lastCycleStart(ZONA_15, at('2026-11-15T00:00:00')))).toBe('2026-11-15')
    expect(iso(nextCycleStart(ZONA_15, at('2026-11-16T10:00:00')))).toBe('2026-12-15')
    expect(iso(nextSuspendDate(ZONA_15, at('2026-11-16T10:00:00')))).toBe('2026-11-20')
    expect(iso(nextSuspendDate(ZONA_15, at('2026-11-21T10:00:00')))).toBe('2026-12-20')
  })
})

describe('Zona 30', () => {
  it('factura del 30 de noviembre: corte el 5 de diciembre (no "5 días después")', () => {
    const c = cycleInfo(ZONA_30, d('2026-11-30'))
    expect([iso(c.dueDate), iso(c.suspendDate), iso(c.periodEnd), c.graceDays]).toEqual(['2026-11-30', '2026-12-05', '2026-12-30', 5])
  })

  it('cambio de año: factura del 30 de diciembre → corte el 5 de enero', () => {
    const c = cycleInfo(ZONA_30, d('2026-12-30'))
    expect([iso(c.suspendDate), iso(c.periodEnd)]).toEqual(['2027-01-05', '2027-01-30'])
  })

  it('febrero no tiene 30: se factura el último día y el corte sigue siendo el 5 de marzo', () => {
    expect(iso(dateOn(2027, 1, 30))).toBe('2027-02-28')
    expect(iso(dateOn(2028, 1, 30))).toBe('2028-02-29') // bisiesto
    const c = cycleInfo(ZONA_30, dateOn(2027, 1, 30))
    expect([iso(c.cycleDate), iso(c.dueDate), iso(c.suspendDate), iso(c.periodEnd)]).toEqual([
      '2027-02-28', '2027-02-28', '2027-03-05', '2027-03-30',
    ])
    // Un enero con 31 días: el periodo va del 30-ene al 28-feb.
    expect(iso(cycleInfo(ZONA_30, d('2027-01-30')).periodEnd)).toBe('2027-02-28')
  })

  it('el 3 de diciembre el ciclo vigente es el del 30 de noviembre y el próximo corte el 5', () => {
    expect(iso(lastCycleStart(ZONA_30, at('2026-12-03T08:00:00')))).toBe('2026-11-30')
    expect(iso(nextSuspendDate(ZONA_30, at('2026-12-03T08:00:00')))).toBe('2026-12-05')
    expect(iso(nextCycleStart(ZONA_30, at('2026-12-03T08:00:00')))).toBe('2026-12-30')
  })
})

describe('horas de factura y corte', () => {
  it('respeta la hora configurada', () => {
    const z = { ...ZONA_15, invoiceHour: 4, suspendHour: 4 }
    expect(iso(lastCycleStart(z, at('2026-11-15T03:59:00')))).toBe('2026-10-15')
    expect(iso(lastCycleStart(z, at('2026-11-15T04:00:00')))).toBe('2026-11-15')
  })
})

describe('shouldSuspend', () => {
  const now = at('2026-11-20T00:00:00')
  it('corta solo con factura impaga y fecha de corte cumplida', () => {
    expect(shouldSuspend([{ status: 'OVERDUE', suspendDate: d('2026-11-20') }], 0, 1, now)).toBe(true)
    expect(shouldSuspend([{ status: 'OVERDUE', suspendDate: d('2026-11-21') }], 0, 1, now)).toBe(false)
  })
  it('nunca corta si la factura está pagada o anulada', () => {
    expect(shouldSuspend([{ status: 'PAID', suspendDate: d('2026-11-20') }, { status: 'CANCELLED', suspendDate: d('2026-11-01') }], 0, 1, now)).toBe(false)
  })
  it('facturas sin fecha de corte (cargos manuales) no cortan', () => {
    expect(shouldSuspend([{ status: 'OVERDUE', suspendDate: null }], 0, 1, now)).toBe(false)
  })
  it('respeta "suspender tras N facturas"', () => {
    const one = [{ status: 'OVERDUE', suspendDate: d('2026-11-20') }]
    expect(shouldSuspend(one, 0, 2, now)).toBe(false)
    expect(shouldSuspend([...one, { status: 'OVERDUE', suspendDate: d('2026-10-20') }], 0, 2, now)).toBe(true)
  })
  it('respeta la hora de corte', () => {
    expect(shouldSuspend([{ status: 'OVERDUE', suspendDate: d('2026-11-20') }], 4, 1, at('2026-11-20T03:00:00'))).toBe(false)
  })
})
