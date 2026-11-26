import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))

describe('antigüedad de la deuda', () => {
  it('clasifica por días de atraso', async () => {
    const { agingBucket } = await import('./collections')
    expect(agingBucket(-3)).toBe('AL_DIA')
    expect(agingBucket(0)).toBe('AL_DIA')
    expect(agingBucket(1)).toBe('D1_30')
    expect(agingBucket(30)).toBe('D1_30')
    expect(agingBucket(31)).toBe('D31_60')
    expect(agingBucket(61)).toBe('D61_90')
    expect(agingBucket(91)).toBe('D90')
  })
})
