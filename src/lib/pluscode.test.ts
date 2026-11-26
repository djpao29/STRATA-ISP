import { describe, expect, it } from 'vitest'
import { decodePlusCode, encodePlusCode, parsePlusCode } from './pluscode'

describe('Plus Codes', () => {
  it('codifica coordenadas (ejemplo oficial de Open Location Code)', () => {
    // Ejemplo de la especificación: 47.0000625,8.0000625 → 8FVC2222+22
    expect(encodePlusCode(47.0000625, 8.0000625)).toBe('8FVC2222+22')
  })

  it('ida y vuelta en Santo Domingo con error menor a 15 m', () => {
    const code = encodePlusCode(18.4861, -69.9312)
    const [lat, lng] = decodePlusCode(code)!
    expect(Math.abs(lat - 18.4861)).toBeLessThan(0.000125)
    expect(Math.abs(lng + 69.9312)).toBeLessThan(0.000125)
  })

  it('recupera un código corto con el punto de referencia', () => {
    const full = encodePlusCode(18.4861, -69.9312)
    const short = full.slice(4) // 4 dígitos + "+" + 2
    const p = parsePlusCode(`${short} Santo Domingo`, [18.47, -69.9])!
    expect(Math.abs(p[0] - 18.4861)).toBeLessThan(0.001)
    expect(Math.abs(p[1] + 69.9312)).toBeLessThan(0.001)
  })

  it('rechaza textos que no son Plus Codes', () => {
    expect(parsePlusCode('Calle 5', [18, -70])).toBeNull()
    expect(decodePlusCode('ABC')).toBeNull()
  })
})
