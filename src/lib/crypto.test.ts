import { randomBytes } from 'crypto'
import { beforeAll, describe, expect, it } from 'vitest'

beforeAll(() => {
  process.env.DATABASE_URL = 'postgresql://u:p@localhost:5432/db'
  process.env.NEXTAUTH_SECRET = 'x'.repeat(32)
  process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64')
})

describe('crypto', () => {
  it('cifra y descifra', async () => {
    const { encrypt, decrypt } = await import('./crypto')
    const secret = 'contraseña-del-router ñ 🔒'
    const enc = encrypt(secret)
    expect(enc).not.toContain('contraseña')
    expect(decrypt(enc)).toBe(secret)
  })

  it('usa un IV distinto en cada cifrado', async () => {
    const { encrypt } = await import('./crypto')
    expect(encrypt('igual')).not.toBe(encrypt('igual'))
  })

  it('detecta datos manipulados', async () => {
    const { encrypt, decrypt } = await import('./crypto')
    const raw = Buffer.from(encrypt('dato'), 'base64')
    raw[raw.length - 1] ^= 1
    expect(() => decrypt(raw.toString('base64'))).toThrow()
  })
})
