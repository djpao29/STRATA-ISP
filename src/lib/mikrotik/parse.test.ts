import { describe, expect, it } from 'vitest'
import { parseHealth, parsePair, parseUptime, rateFromCounters, routeInterface, toBool, toInt } from './parse'

describe('parseUptime', () => {
  it('interpreta el formato de RouterOS', () => {
    expect(parseUptime('3d18h29m46s')).toBe(3 * 86400 + 18 * 3600 + 29 * 60 + 46)
    expect(parseUptime('1w2d')).toBe(9 * 86400)
    expect(parseUptime('45s')).toBe(45)
    expect(parseUptime('00:12:34')).toBe(754)
    expect(parseUptime(undefined)).toBe(0)
  })
})

describe('valores como texto', () => {
  it('convierte números y booleanos', () => {
    expect(toInt('35')).toBe(35)
    expect(toInt('abc', 7)).toBe(7)
    expect(toBool('true')).toBe(true)
    expect(toBool('yes')).toBe(true)
    expect(toBool('false')).toBe(false)
    expect(parsePair('1000/2000')).toEqual([1000, 2000])
  })
})

describe('parseHealth', () => {
  it('RouterOS 7: lista de sensores', () => {
    const v7 = [
      { '.id': '*D', name: 'voltage', value: '24.1', type: 'V' },
      { '.id': '*E', name: 'temperature', value: '41', type: 'C' },
    ]
    expect(parseHealth(v7)).toEqual({ temperature: 41, voltage: 24.1 })
  })

  it('prefiere la temperatura de CPU y si no, toma el sensor más alto', () => {
    expect(parseHealth([{ name: 'cpu-temperature', value: '55' }, { name: 'board-temperature1', value: '40' }]).temperature).toBe(55)
    expect(parseHealth([{ name: 'sfp-temperature', value: '48' }, { name: 'switch-temperature', value: '52' }]).temperature).toBe(52)
  })

  it('equipo sin sensores (CHR) → null', () => {
    expect(parseHealth([])).toEqual({ temperature: null, voltage: null })
    expect(parseHealth(null)).toEqual({ temperature: null, voltage: null })
  })
})

describe('routeInterface', () => {
  it('extrae la interfaz de salida de la ruta por defecto', () => {
    expect(routeInterface({ 'immediate-gw': '192.168.1.1%ether1' })).toBe('ether1')
    expect(routeInterface({ gateway: 'pppoe-out1' })).toBe('pppoe-out1')
    expect(routeInterface({ gateway: '10.0.0.1' })).toBeNull()
  })
})

describe('rateFromCounters', () => {
  it('calcula bits por segundo entre dos lecturas', () => {
    const t0 = new Date('2026-11-26T00:00:00Z')
    const t1 = new Date('2026-11-26T00:01:00Z')
    // 750 MB en 60 s = 100 Mbps
    expect(rateFromCounters(BigInt(0), t0, BigInt(750_000_000), t1)).toBe(BigInt(100_000_000))
  })
  it('contador reiniciado (reboot) o primera lectura → null', () => {
    const t0 = new Date('2026-11-26T00:00:00Z')
    const t1 = new Date('2026-11-26T00:01:00Z')
    expect(rateFromCounters(BigInt(1000), t0, BigInt(10), t1)).toBeNull()
    expect(rateFromCounters(BigInt(0), null, BigInt(10), t1)).toBeNull()
  })
})
