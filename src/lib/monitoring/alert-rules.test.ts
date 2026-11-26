import { describe, expect, it } from 'vitest'
import { computeAlerts, type InterfaceState } from './alert-rules'

const t = { cpuThreshold: 85, memThreshold: 90, tempThreshold: 70, latencyThreshold: 1500 }
const ok = { cpuLoad: 20, memUsedPct: 40, temperature: 45, latencyMs: 30 }
const iface = (p: Partial<InterfaceState>): InterfaceState => ({
  name: 'ether1', running: true, disabled: false, role: 'OTHER', isSfp: false, alertOnDown: false, missing: false, ...p,
})

describe('computeAlerts', () => {
  it('sin alertas cuando todo está dentro de los límites', () => {
    expect(computeAlerts(ok, [iface({})], t)).toEqual([])
  })

  it('CPU, memoria, temperatura y latencia por encima del límite', () => {
    const keys = computeAlerts({ cpuLoad: 96, memUsedPct: 92, temperature: 82, latencyMs: 2000 }, [], t).map((a) => [a.key, a.severity])
    expect(keys).toEqual([
      ['cpu', 'CRITICAL'],
      ['memory', 'WARNING'],
      ['temperature', 'CRITICAL'],
      ['latency', 'WARNING'],
    ])
  })

  it('sin sensor de temperatura no hay alerta de temperatura', () => {
    expect(computeAlerts({ ...ok, temperature: null }, [], t)).toEqual([])
  })

  it('WAN caída es crítica; SFP caído es advertencia; solo si alertOnDown', () => {
    const alerts = computeAlerts(
      ok,
      [
        iface({ name: 'ether1', role: 'WAN', running: false, alertOnDown: true }),
        iface({ name: 'sfp-sfpplus1', isSfp: true, running: false, alertOnDown: true }),
        iface({ name: 'ether5', running: false, alertOnDown: false }),
        iface({ name: 'sfp2', isSfp: true, running: false, disabled: true, alertOnDown: true }),
      ],
      t
    )
    expect(alerts.map((a) => [a.key, a.severity])).toEqual([
      ['iface_down:ether1', 'CRITICAL'],
      ['iface_down:sfp-sfpplus1', 'WARNING'],
    ])
    expect(alerts[0].message).toContain('WAN')
    expect(alerts[1].message).toContain('SFP')
  })

  it('interfaz desaparecida del router (p. ej. pppoe-out caída)', () => {
    const [a] = computeAlerts(ok, [iface({ name: 'pppoe-out1', role: 'WAN', alertOnDown: true, missing: true })], t)
    expect(a.key).toBe('iface_down:pppoe-out1')
    expect(a.message).toContain('ya no existe')
  })
})
