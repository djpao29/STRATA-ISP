import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'

const GRAPH_URL = 'https://graph.facebook.com/v21.0'

/** Normaliza un teléfono a formato internacional sin "+" (lo que pide la API). */
export function normalizePhone(phone: string, defaultCountryCode = '593') {
  const digits = phone.replace(/\D/g, '')
  if (phone.trim().startsWith('+')) return digits
  if (digits.startsWith('0')) return defaultCountryCode + digits.slice(1)
  return digits
}

/**
 * Envía una plantilla aprobada de WhatsApp Cloud API.
 * Los mensajes que inicia la empresa deben usar plantillas aprobadas por Meta.
 */
export async function sendTemplate(params: {
  tenantId: string
  to: string
  template: string
  language: string
  bodyParams?: string[]
}) {
  const config = await prisma.whatsAppConfig.findUnique({ where: { tenantId: params.tenantId } })
  if (!config) throw new Error('WhatsApp no está configurado.')
  if (!config.isActive) throw new Error('La integración de WhatsApp está desactivada.')

  const response = await fetch(`${GRAPH_URL}/${encodeURIComponent(config.phoneNumberId)}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${decrypt(config.accessTokenEnc)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: normalizePhone(params.to),
      type: 'template',
      template: {
        name: params.template,
        language: { code: params.language },
        ...(params.bodyParams?.length
          ? { components: [{ type: 'body', parameters: params.bodyParams.map((text) => ({ type: 'text', text })) }] }
          : {}),
      },
    }),
    signal: AbortSignal.timeout(15000),
  })

  const body = (await response.json().catch(() => ({}))) as {
    error?: { message?: string }
    messages?: Array<{ id: string }>
  }
  if (!response.ok) {
    throw new Error(`WhatsApp respondió ${response.status}: ${body.error?.message ?? 'error desconocido'}`)
  }
  return body.messages?.[0]?.id
}
