import { describe, expect, it } from 'vitest'
import { parseConsoleAutofind, parseConsoleOnus, perOnuCommands } from './console'

// Formato real de una Hioso EPON (MACs de ejemplo).
const INFO = [
  'EPON# show onu info epon 0/1 all',
  '',
  'OnuId  MacAddress        Status  Firmware ChipId Ge Fe Pots CtcStatus      CtcVer Activate Uptime           Name ',
  '===================================================================================================================',
  '0/1:1  aa:bb:cc:00:00:01 Up      5633     9602   1  1  0    CtcNegDone     30     Yes      8H14M14S         CLIENTE_UNO ',
  '0/1:4  aa:bb:cc:00:00:04 Down    3230     6301   1  3  1    --             30     Yes      0H0M0S            ',
  '--- Enter Key To Continue ----                                               0/1:31 aa:bb:cc:00:00:31 Up      3230     6301   1  3  1    CtcNegDone     30     Yes      3D22H18M16S',
  'EPON# show onu optical-ddm epon 0/1 1',
  ' Temperature  : 37.00 C ',
  ' Voltage      : 3.00  V ',
  ' TxPower      : 1.87 dBm',
  ' RxPower      : -19.59 dBm',
  'EPON# ',
].join('\r\n')

describe('Hioso EPON', () => {
  it('lee la lista de ONUs (incluida la línea con la paginación)', () => {
    const r = parseConsoleOnus(INFO)
    expect(r.map((o) => [o.slot, o.port, o.onuId, o.serial, o.status])).toEqual([
      [0, 1, 1, 'AA:BB:CC:00:00:01', 'ACTIVE'],
      [0, 1, 4, 'AA:BB:CC:00:00:04', 'OFFLINE'],
      [0, 1, 31, 'AA:BB:CC:00:00:31', 'ACTIVE'],
    ])
  })

  it('toma la señal del bloque optical-ddm de cada ONU', () => {
    const r = parseConsoleOnus(INFO)
    expect(r.find((o) => o.onuId === 1)?.rxPower).toBe(-19.59)
    expect(r.find((o) => o.onuId === 31)?.rxPower).toBeNull()
  })

  it('arma un comando de señal por cada ONU en línea', () => {
    const cmds = perOnuCommands('enable\n@onu show onu optical-ddm epon {frame}/{port} {onuId}', parseConsoleOnus(INFO), 0)
    expect(cmds).toEqual(['show onu optical-ddm epon 0/1 1', 'show onu optical-ddm epon 0/1 31'])
  })

  it('usa el puerto del prompt para las ONUs en intento de registro', () => {
    const out = ['EPON(config)# interface epon 0/2', 'EPON(epon_0/2)# show attempt onu', ' 1   aa:bb:cc:99:99:99  attempt', 'EPON(epon_0/2)# exit'].join('\n')
    expect(parseConsoleAutofind(out)).toEqual([{ slot: 0, port: 2, serial: 'AA:BB:CC:99:99:99', equipment: null }])
  })
})
