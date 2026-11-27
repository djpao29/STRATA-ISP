import { describe, expect, it } from 'vitest'
import { groupQueueSpeeds, parseBurst, parseRate, parseRateLimit, pppClientName, pppClients, queueClients, queueHostIp, rateLimitFor, speedPlanName, splitQueueName } from './plans'

describe('importar planes desde colas simples', () => {
  it('agrupa las colas de clientes por velocidad', () => {
    const { speeds, ignored } = groupQueueSpeeds([
      { name: 'Juan', 'max-limit': '5000000/20000000', 'burst-limit': '0/0', 'burst-threshold': '0/0', 'burst-time': '0s/0s', priority: '8/8' },
      { name: 'Ana', 'max-limit': '5000000/20000000', 'burst-limit': '0/0', 'burst-threshold': '0/0', 'burst-time': '0s/0s', priority: '8/8' },
      { name: 'Pedro', 'max-limit': '10M/10M', 'burst-limit': '20000000/20000000', 'burst-threshold': '8000000/8000000', 'burst-time': '10s/10s', priority: '4/4' },
      { name: 'TORRE', 'max-limit': '100M/100M' },
      { name: 'Hijo', parent: 'TORRE', 'max-limit': '3M/3M' },
      { name: '<pppoe-x>', dynamic: 'true', 'max-limit': '5M/5M' },
      { name: 'libre', 'max-limit': '0/0' },
    ])
    expect(ignored).toBe(3)
    expect(speeds).toEqual([
      { upload: 3, download: 3, burst: null, priorityUp: 8, priorityDown: 8, queues: 1 },
      { upload: 10, download: 10, burst: '20M/20M 8M/8M 10/10', priorityUp: 4, priorityDown: 4, queues: 1 },
      { upload: 5, download: 20, burst: null, priorityUp: 8, priorityDown: 8, queues: 2 },
    ])
    expect(parseBurst(speeds[1].burst)).toEqual({ burstLimit: '20M/20M', burstThreshold: '8M/8M', burstTime: '10s/10s' })
  })

  it('saca los clientes de las colas (una IP por cola)', () => {
    const { clients, ignored } = queueClients([
      { name: 'Juan Pérez', target: '10.0.0.2/32', 'max-limit': '5M/20M', comment: 'casa azul' },
      { name: 'Ana', target: '10.0.0.3', 'max-limit': '5M/20M', disabled: 'true' },
      { name: 'Red', target: '10.0.0.0/24', 'max-limit': '50M/50M' },
      { name: 'Dos', target: '10.0.0.4/32,10.0.0.5/32', 'max-limit': '5M/5M' },
      { name: '<pppoe-x>', target: '<pppoe-x>', dynamic: 'true', 'max-limit': '5M/5M' },
    ])
    expect(ignored).toBe(3)
    expect(clients.map((c) => [c.queue, c.ip, c.comment, c.disabled])).toEqual([
      ['Juan Pérez', '10.0.0.2', 'casa azul', false],
      ['Ana', '10.0.0.3', null, true],
    ])
    expect(queueHostIp('300.1.1.1')).toBeNull()
  })

  it('saca los clientes PPPoE de /ppp/secret', () => {
    const { clients, ignored } = pppClients([
      { name: 'juanp', password: 'x1', profile: '20M', service: 'pppoe', 'remote-address': '10.30.0.2', comment: 'Juan Pérez' },
      { name: 'ana01', profile: '10M', service: 'any', disabled: 'true' },
      { name: 'vpn-oficina', profile: 'default', service: 'l2tp' },
      { name: 'JUANP', profile: '20M', service: 'pppoe' },
    ])
    expect(ignored).toBe(2)
    expect(clients).toEqual([
      { user: 'juanp', password: 'x1', profile: '20M', ip: '10.30.0.2', comment: 'Juan Pérez', disabled: false },
      { user: 'ana01', password: null, profile: '10M', ip: null, comment: null, disabled: true },
    ])
    expect(pppClientName(clients[0])).toBe('Juan Pérez')
    expect(pppClientName(clients[1])).toBe('ana01')
    expect(pppClientName({ user: 'u1', comment: 'tel 8095551234' })).toBe('u1')
  })

  it('separa nombre y apellido de la cola', () => {
    expect(splitQueueName('Juan  Pérez Gómez')).toEqual({ firstName: 'Juan', lastName: 'Pérez Gómez' })
    expect(splitQueueName('maria_lopez')).toEqual({ firstName: 'maria', lastName: 'lopez' })
    expect(splitQueueName('Torre1')).toEqual({ firstName: 'Torre1', lastName: '' })
  })

  it('nombra el plan por su velocidad', () => {
    expect(speedPlanName({ download: 20, upload: 5 })).toBe('20/5 Mbps')
    expect(speedPlanName({ download: 10, upload: 10 })).toBe('10 Mbps')
  })
})

describe('velocidades de MikroTik', () => {
  it('convierte unidades a bps', () => {
    expect(parseRate('10M')).toBe(10_000_000)
    expect(parseRate('512k')).toBe(512_000)
    expect(parseRate('1G')).toBe(1_000_000_000)
    expect(parseRate('2000000')).toBe(2_000_000)
    expect(parseRate('abc')).toBeNull()
  })

  it('lee el rate-limit de un perfil PPP (subida/bajada)', () => {
    expect(parseRateLimit('5M/20M')).toEqual({ upload: 5, download: 20 })
    expect(parseRateLimit('10M/30M 15M/40M 8M/25M 10/10')).toEqual({ upload: 10, download: 30 })
    expect(parseRateLimit('10M')).toEqual({ upload: 10, download: 10 })
    expect(parseRateLimit(undefined)).toEqual({ upload: 0, download: 0 })
    expect(parseRateLimit('512k/1M')).toEqual({ upload: 1, download: 1 })
  })

  it('arma el rate-limit del plan', () => {
    expect(rateLimitFor({ upload: 10, download: 35 })).toBe('10M/35M')
  })

  it('valida y separa el burst', () => {
    expect(parseBurst('20M/5M 15M/4M 10')).toEqual({ burstLimit: '20M/5M', burstThreshold: '15M/4M', burstTime: '10s/10s' })
    expect(parseBurst('20M/40M 15M/30M 8/16')).toEqual({ burstLimit: '20M/40M', burstThreshold: '15M/30M', burstTime: '8s/16s' })
    expect(parseBurst('')).toBeNull()
    expect(parseBurst('20M 15M 10')).toBeNull()
  })
})
