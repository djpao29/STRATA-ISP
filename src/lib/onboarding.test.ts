import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))

const d = (s: string) => new Date(`${s}T00:00:00Z`)

describe('prorate (factura de instalación)', () => {
  it('cobra los días que faltan hasta el próximo ciclo', async () => {
    const { prorate } = await import('./onboarding')
    // Zona 15: ciclo 15-nov → 15-dic (30 días); instalación el 25-nov → 20 días.
    expect(prorate(1500, d('2026-11-25'), d('2026-11-15'), d('2026-12-15'))).toEqual({ days: 20, cycleDays: 30, amount: 1000 })
  })

  it('instalado el mismo día del ciclo → mes completo', async () => {
    const { prorate } = await import('./onboarding')
    expect(prorate(1000, d('2026-11-15'), d('2026-11-15'), d('2026-12-15')).amount).toBe(1000)
  })

  it('el día antes del ciclo cobra 1 día', async () => {
    const { prorate } = await import('./onboarding')
    expect(prorate(3000, d('2026-12-14'), d('2026-11-15'), d('2026-12-15'))).toEqual({ days: 1, cycleDays: 30, amount: 100 })
  })
})
