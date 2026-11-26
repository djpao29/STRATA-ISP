import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))

describe('normalizePhone', () => {
  it('convierte números locales de Ecuador a formato internacional', async () => {
    const { normalizePhone } = await import('./whatsapp')
    expect(normalizePhone('0991234567')).toBe('593991234567')
    expect(normalizePhone('099 123 4567')).toBe('593991234567')
  })

  it('respeta números que ya traen el código de país', async () => {
    const { normalizePhone } = await import('./whatsapp')
    expect(normalizePhone('+593 99 123 4567')).toBe('593991234567')
    expect(normalizePhone('+1 (555) 010-9999')).toBe('15550109999')
  })

  it('convierte números de República Dominicana', async () => {
    const { normalizePhone } = await import('./whatsapp')
    expect(normalizePhone('809-555-1234', 'DO')).toBe('18095551234')
    expect(normalizePhone('(829) 555 1234', 'DO')).toBe('18295551234')
    expect(normalizePhone('1 849 555 1234', 'DO')).toBe('18495551234')
    expect(normalizePhone('+1 809 555 1234', 'DO')).toBe('18095551234')
  })
})
