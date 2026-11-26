import { describe, expect, it } from 'vitest'
import { currentPeriodIn, monthStartIn, todayIn } from './dates'

describe('todayIn', () => {
  it('a las 20:00 de Ecuador sigue siendo el mismo día (aunque en UTC ya sea el siguiente)', () => {
    const now = new Date('2026-11-26T01:00:00Z') // 25/11 20:00 en Guayaquil (UTC-5)
    expect(todayIn('America/Guayaquil', now).toISOString()).toBe('2026-11-25T00:00:00.000Z')
    expect(todayIn('UTC', now).toISOString()).toBe('2026-11-26T00:00:00.000Z')
  })

  it('calcula el inicio de mes y el periodo en la zona de la empresa', () => {
    const now = new Date('2026-12-01T03:00:00Z') // 30/11 22:00 en Guayaquil
    expect(monthStartIn('America/Guayaquil', now).toISOString()).toBe('2026-11-01T00:00:00.000Z')
    expect(currentPeriodIn('America/Guayaquil', now)).toBe('2026-11')
  })
})
