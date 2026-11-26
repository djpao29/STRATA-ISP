import { describe, expect, it } from 'vitest'
import { detectMime, readReceipt } from './uploads'

const file = (bytes: number[] | Buffer, name = 'x', type = 'application/octet-stream') =>
  new File([new Uint8Array(Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes))], name, { type })

describe('comprobantes', () => {
  it('reconoce JPG, PNG, WEBP y PDF por su contenido', () => {
    expect(detectMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe('image/jpeg')
    expect(detectMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('image/png')
    expect(detectMime(Buffer.from('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp')
    expect(detectMime(Buffer.from('%PDF-1.7\n'))).toBe('application/pdf')
  })

  it('rechaza archivos que solo se hacen pasar por imagen', async () => {
    await expect(readReceipt(file(Buffer.from('<script>alert(1)</script>'), 'foto.jpg', 'image/jpeg'))).rejects.toThrow(/JPG, PNG/)
  })

  it('rechaza archivos de más de 5 MB', async () => {
    const big = Buffer.alloc(5 * 1024 * 1024 + 1)
    big.set([0xff, 0xd8, 0xff])
    await expect(readReceipt(file(big, 'grande.jpg'))).rejects.toThrow(/5 MB/)
  })

  it('sin archivo → null; nombre saneado', async () => {
    expect(await readReceipt(null)).toBeNull()
    expect(await readReceipt(file([], 'vacio.jpg'))).toBeNull()
    const r = await readReceipt(file([0xff, 0xd8, 0xff, 0xe0], '../../etc/pa$$wd.jpg'))
    expect(r?.mime).toBe('image/jpeg')
    expect(r?.name).not.toContain('/')
  })
})
