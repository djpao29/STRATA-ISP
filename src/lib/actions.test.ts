import { describe, expect, it } from 'vitest'
import { money, requiredNumber } from './actions'

const firstError = (r: { success: boolean; error?: { issues: Array<{ message: string }> } }) => r.error?.issues[0]?.message

describe('requiredNumber', () => {
  it('vacío → "Obligatorio"; texto → "Debe ser un número"', () => {
    expect(firstError(requiredNumber().safeParse(undefined))).toBe('Obligatorio')
    expect(firstError(requiredNumber().safeParse(''))).toBe('Obligatorio')
    expect(firstError(requiredNumber().safeParse('abc'))).toBe('Debe ser un número')
    expect(requiredNumber().parse('42')).toBe(42)
  })
})

describe('money', () => {
  it('redondea a centavos y exige monto positivo', () => {
    expect(money.parse('25.505')).toBe(25.51)
    expect(money.parse('10')).toBe(10)
    expect(firstError(money.safeParse('0'))).toBe('Debe ser mayor que 0')
    expect(firstError(money.safeParse('-5'))).toBe('Debe ser mayor que 0')
    expect(firstError(money.safeParse(''))).toBe('Obligatorio')
  })
})
