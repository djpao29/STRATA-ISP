/**
 * Validación de comprobantes subidos (fotos y PDF). Se comprueba el contenido real del archivo
 * (firma de bytes), no solo la extensión o el tipo que dice el navegador.
 */

export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024

const SIGNATURES: Array<{ mime: string; test: (b: Buffer) => boolean }> = [
  { mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/webp', test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
  { mime: 'application/pdf', test: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
]

export function detectMime(data: Buffer) {
  return SIGNATURES.find((s) => s.test(data))?.mime ?? null
}

export type Upload = { data: Buffer; mime: string; name: string }

/** Lee un archivo de un formulario. Devuelve null si no se envió ninguno; lanza un error si no es válido. */
export async function readReceipt(value: FormDataEntryValue | null): Promise<Upload | null> {
  if (!value || typeof value === 'string' || value.size === 0) return null
  if (value.size > MAX_RECEIPT_BYTES) throw new Error('El comprobante supera 5 MB. Reduce la foto o súbelo en PDF.')
  const data = Buffer.from(await value.arrayBuffer())
  const mime = detectMime(data)
  if (!mime) throw new Error('El comprobante debe ser una imagen JPG, PNG o WEBP, o un PDF.')
  const name = (value.name || 'comprobante').replace(/[^\w.\- ]+/g, '_').slice(0, 100)
  return { data, mime, name }
}

export function isImage(mime: string | null | undefined) {
  return !!mime && mime.startsWith('image/')
}
