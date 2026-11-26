import { describe, expect, it } from 'vitest'
import { findPosition, isReadOnlyCommand, macForms, normalizeOnuId, parseConsoleAutofind, parseConsoleOnus, rxFromText, statusFromText } from './console'

describe('identificadores de ONU', () => {
  it('normaliza MACs en cualquier formato', () => {
    expect(normalizeOnuId('aa:bb:cc:dd:ee:01')).toBe('AA:BB:CC:DD:EE:01')
    expect(normalizeOnuId('AA-BB-CC-DD-EE-01')).toBe('AA:BB:CC:DD:EE:01')
    expect(normalizeOnuId('aabb.ccdd.ee01')).toBe('AA:BB:CC:DD:EE:01')
    expect(normalizeOnuId('aabbccddee01')).toBe('AA:BB:CC:DD:EE:01')
  })
  it('deja los seriales GPON en mayúsculas', () => {
    expect(normalizeOnuId('hwtc1a2b3c4d')).toBe('HWTC1A2B3C4D')
    expect(normalizeOnuId('x y')).toBeNull()
  })
  it('da las variantes de MAC para las plantillas', () => {
    expect(macForms('AA:BB:CC:DD:EE:01')).toEqual({ mac: 'AA:BB:CC:DD:EE:01', macDot: 'aabb.ccdd.ee01', macDash: 'AA-BB-CC-DD-EE-01', macPlain: 'aabbccddee01' })
  })
})

describe('lectura tolerante de consola', () => {
  it('posiciones PON de varias marcas', () => {
    expect(findPosition('EPON0/1:3 ')).toEqual({ slot: 0, port: 1, onuId: 3 })
    expect(findPosition('gpon-onu_1/2/3:4')).toEqual({ slot: 2, port: 3, onuId: 4 })
    expect(findPosition('  0/1/2:5  ')).toEqual({ slot: 1, port: 2, onuId: 5 })
    expect(findPosition('epon 0/4 ')).toEqual({ slot: 0, port: 4, onuId: null })
  })
  it('estado y señal', () => {
    expect(statusFromText('Online')).toBe('ACTIVE')
    expect(statusFromText('offline')).toBe('OFFLINE')
    expect(statusFromText('dying-gasp')).toBe('POWER_OFF')
    expect(statusFromText('LOS')).toBe('LOS')
    expect(rxFromText('-21.5 dBm')).toBe(-21.5)
    expect(rxFromText('Rx: -19.20')).toBe(-19.2)
  })
  it('lista tipo Hioso / BDCOM (EPON por MAC)', () => {
    const out = [
      'Epon# show onu info',
      'OnuId        Mac               Status     RxPower',
      'EPON0/1:1    00:1e:a5:11:22:33  online    -20.50(dBm)',
      'EPON0/1:2    001e.a511.2244     offline',
      'EPON0/2:1    00-1E-A5-11-22-55  dying-gasp',
    ].join('\n')
    expect(parseConsoleOnus(out).map((o) => [o.slot, o.port, o.onuId, o.serial, o.status, o.rxPower])).toEqual([
      [0, 1, 1, '00:1E:A5:11:22:33', 'ACTIVE', -20.5],
      [0, 1, 2, '00:1E:A5:11:22:44', 'OFFLINE', null],
      [0, 2, 1, '00:1E:A5:11:22:55', 'POWER_OFF', null],
    ])
  })
  it('sigue leyendo la lista de VSOL (GPON por serial)', () => {
    const out = `GPON0/1:1   VSOL1A2B3C4D   online   -20.15(dBm)\nGPON0/1:2   VSOL00000002   dying-gasp`
    expect(parseConsoleOnus(out).map((o) => [o.port, o.onuId, o.serial, o.status])).toEqual([
      [1, 1, 'VSOL1A2B3C4D', 'ACTIVE'],
      [1, 2, 'VSOL00000002', 'POWER_OFF'],
    ])
  })
  it('combina estado y señal de dos comandos', () => {
    const out = 'EPON0/1:1  00:1e:a5:11:22:33  online\nEPON0/1:1  00:1e:a5:11:22:33  -22.10 dBm'
    const r = parseConsoleOnus(out)
    expect(r).toHaveLength(1)
    expect([r[0].status, r[0].rxPower]).toEqual(['ACTIVE', -22.1])
  })
  it('autofind por MAC', () => {
    expect(parseConsoleAutofind('EPON0/3   00:1e:a5:99:88:77  unauth')).toEqual([{ slot: 0, port: 3, serial: '00:1E:A5:99:88:77', equipment: null }])
  })
})

describe('consola de prueba', () => {
  it('solo permite consultas', () => {
    for (const c of ['show onu info', 'display ont info 0 all', 'enable', 'configure terminal', 'interface epon 0/1', 'terminal length 0', 'show ?']) expect(isReadOnlyCommand(c)).toBe(true)
    for (const c of ['onu add 1 1 mac aa', 'reboot', 'write', 'no onu 1', 'delete flash:', 'username x password y', '']) expect(isReadOnlyCommand(c)).toBe(false)
  })
})
