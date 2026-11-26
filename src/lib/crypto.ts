import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { env } from '@/lib/env'

// AES-256-GCM. Formato guardado: base64(iv[12] | tag[16] | ciphertext)

function key() {
  return Buffer.from(env().ENCRYPTION_KEY, 'base64')
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64')
}

export function decrypt(payload: string): string {
  const raw = Buffer.from(payload, 'base64')
  const decipher = createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12))
  decipher.setAuthTag(raw.subarray(12, 28))
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8')
}
