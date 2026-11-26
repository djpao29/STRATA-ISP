import { describe, expect, it } from 'vitest'
import { currentPeriodIn, instantToLocalInput, localInputToInstant, monthStartIn, todayIn } from './dates'

describe('hora local ↔ instante', () => {
  it('10:30 en Santo Domingo (UTC-4) son las 14:30 UTC, y vuelta', () => {
    const i = localInputToInstant('2026-11-26T10:30', 'America/Santo_Domingo')
    expect(i.toISOString()).toBe('2026-11-26T14:30:00.000Z')
    expect(instantToLocalInput(i, 'America/Santo_Domingo')).toBe('2026-11-26T10:30')
  })
  it('respeta el horario de verano de otras zonas (Madrid en julio, UTC+2)', () => {
    expect(localInputToInstant('2026-07-01T09:00', 'Europe/Madrid').toISOString()).toBe('2026-07-01T07:00:00.000Z')
  })
  it('rechaza formatos inválidos', () => {
    expect(() => localInputToInstant('26/11/2026 10:30', 'UTC')).toThrow()
  })
})

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
