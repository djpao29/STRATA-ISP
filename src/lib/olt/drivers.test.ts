import { describe, expect, it } from 'vitest'
import {
  AUTH_TEMPLATES,
  authCommands,
  freeOnuId,
  huaweiPort,
  huaweiPower,
  huaweiStatus,
  parseVsolAutofind,
  parseVsolOnus,
  parseZteUncfg,
  ztePort,
  ztePower,
  zteStatus,
} from './drivers'
import { gponSerial } from './snmp'

describe('Huawei', () => {
  it('decodifica el ifIndex GPON (slot/puerto)', () => {
    expect(huaweiPort(4194304000 + 1 * 8192 + 3 * 256)).toEqual({ slot: 1, port: 3 })
    expect(huaweiPort(4194304000)).toEqual({ slot: 0, port: 0 })
  })
  it('estado por run status y causa de caída', () => {
    expect(huaweiStatus(1, null)).toBe('ACTIVE')
    expect(huaweiStatus(2, 13)).toBe('POWER_OFF')
    expect(huaweiStatus(2, 1)).toBe('LOS')
    expect(huaweiStatus(2, 9)).toBe('OFFLINE')
    expect(huaweiStatus(null, null)).toBe('UNKNOWN')
  })
  it('potencia en centésimas de dBm', () => {
    expect(huaweiPower(-2105)).toBe(-21.05)
    expect(huaweiPower(2147483647)).toBeNull()
  })
})

describe('ZTE', () => {
  it('decodifica el ifIndex gpon-olt_1/slot/puerto', () => {
    expect(ztePort(268501248)).toEqual({ slot: 1, port: 1 })
    expect(ztePort(268435456 + 2 * 65536 + 5 * 256)).toEqual({ slot: 2, port: 5 })
  })
  it('estado por fase', () => {
    expect(zteStatus(4)).toBe('ACTIVE')
    expect(zteStatus(2)).toBe('LOS')
    expect(zteStatus(5)).toBe('POWER_OFF')
    expect(zteStatus(7)).toBe('OFFLINE')
  })
  it('potencia recibida', () => {
    expect(ztePower(4500)).toBe(-21)
    expect(ztePower(65535)).toBeNull()
  })
  it('lee las ONUs sin configurar', () => {
    const out = `OnuIndex                 Sn                  State\n---------------------------------------------------\ngpon-onu_1/2/3:1         ZTEGC0A1B2C3        unknown\n`
    expect(parseZteUncfg(out)).toEqual([{ slot: 2, port: 3, serial: 'ZTEGC0A1B2C3', equipment: null }])
  })
})

describe('VSOL', () => {
  it('lee ONUs y su estado', () => {
    const out = `GPON0/1:1   VSOL1A2B3C4D   online   -20.15(dBm)\nGPON0/1:2   VSOL00000002   dying-gasp\nGPON0/2:1   HWTC0A0B0C0D   los`
    const r = parseVsolOnus(out)
    expect(r.map((o) => [o.port, o.onuId, o.serial, o.status, o.rxPower])).toEqual([
      [1, 1, 'VSOL1A2B3C4D', 'ACTIVE', -20.15],
      [1, 2, 'VSOL00000002', 'POWER_OFF', null],
      [2, 1, 'HWTC0A0B0C0D', 'LOS', null],
    ])
  })
  it('lee el autofind', () => {
    expect(parseVsolAutofind('1   GPON0/3   VSOL99999999   unknown')).toEqual([{ slot: 0, port: 3, serial: 'VSOL99999999', equipment: null }])
  })
})

describe('autorización', () => {
  it('arma los comandos de Huawei', () => {
    const cmds = authCommands(AUTH_TEMPLATES.HUAWEI, {
      frame: 0, slot: 1, port: 3, onuId: 5, serial: 'hwtc1a2b3c4d', desc: 'Juan Pérez #1', lineProfile: '10', srvProfile: '10', vlan: 100, type: '',
    })
    expect(cmds).toContain('ont add 3 5 sn-auth HWTC1A2B3C4D omci ont-lineprofile-id 10 ont-srvprofile-id 10 desc "Juan_P_rez__1"')
    expect(cmds).toContain('service-port vlan 100 gpon 0/1/3 ont 5 gemport 1 multi-service user-vlan 100 tag-transform translate')
  })
  it('falla si falta un valor', () => {
    expect(() =>
      authCommands(AUTH_TEMPLATES.ZTE, { frame: 1, slot: 1, port: 1, onuId: 1, serial: 'ZTEG00000001', desc: 'x', lineProfile: 'P10M', srvProfile: '', vlan: 100, type: '' })
    ).toThrow(/\{type\}/)
  })
  it('elige el primer ID libre', () => {
    expect(freeOnuId([0, 1, 3], 'HUAWEI')).toBe(2)
    expect(freeOnuId([1, 2], 'ZTE')).toBe(3)
  })
  it('serial GPON desde 8 bytes', () => {
    expect(gponSerial(Buffer.from([0x48, 0x57, 0x54, 0x43, 0x1a, 0x2b, 0x3c, 0x4d]))).toBe('HWTC1A2B3C4D')
  })
})
