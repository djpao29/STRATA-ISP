import { describe, expect, it } from 'vitest'
import { parseBurst, parseRate, parseRateLimit, rateLimitFor } from './plans'

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
