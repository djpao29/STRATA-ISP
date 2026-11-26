import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/audit', () => ({ audit: vi.fn() }))

const d = (s: string) => new Date(`${s}T00:00:00.000Z`)

describe('promesas de pago', () => {
  it('vigente hasta el día prometido inclusive; incumplida al día siguiente', async () => {
    const { promiseOutcome } = await import('./promises')
    expect(promiseOutcome({ promisedDate: d('2026-11-25'), today: d('2026-11-25'), hasDebt: true })).toBe('ACTIVE')
    expect(promiseOutcome({ promisedDate: d('2026-11-25'), today: d('2026-11-26'), hasDebt: true })).toBe('BROKEN')
  })

  it('cumplida en cuanto el cliente ya no debe nada', async () => {
    const { promiseOutcome } = await import('./promises')
    expect(promiseOutcome({ promisedDate: d('2026-11-25'), today: d('2026-11-20'), hasDebt: false })).toBe('FULFILLED')
    expect(promiseOutcome({ promisedDate: d('2026-11-25'), today: d('2026-11-30'), hasDebt: false })).toBe('FULFILLED')
  })

  it('valida la fecha: no en el pasado y máximo 30 días', async () => {
    const { validatePromiseDate } = await import('./promises')
    expect(validatePromiseDate(d('2026-11-24'), d('2026-11-25'))).toMatch(/anterior/)
    expect(validatePromiseDate(d('2026-11-25'), d('2026-11-25'))).toBeNull()
    expect(validatePromiseDate(d('2026-12-25'), d('2026-11-25'))).toBeNull()
    expect(validatePromiseDate(d('2026-12-26'), d('2026-11-25'))).toMatch(/30 días/)
  })
})
