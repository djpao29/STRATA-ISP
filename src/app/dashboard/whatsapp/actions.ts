'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireActionUser } from '@/lib/session'
import { audit } from '@/lib/audit'
import { encrypt } from '@/lib/crypto'
import { sendTemplate } from '@/lib/whatsapp'
import { formToObject, toActionError, type ActionState } from '@/lib/actions'

export async function saveWhatsAppConfig(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('whatsapp')
    const data = z
      .object({
        phoneNumberId: z.string({ required_error: 'Obligatorio' }).regex(/^\d{5,30}$/, 'Solo dígitos (ID del número en Meta)'),
        displayPhone: z.string().max(30).optional(),
        accessToken: z.string().max(1000).optional(),
        isActive: z.literal('on').optional(),
      })
      .parse(formToObject(formData))

    const existing = await prisma.whatsAppConfig.findUnique({ where: { tenantId: user.tenantId } })
    if (!existing && !data.accessToken) {
      return { error: 'Revisa los campos marcados.', fieldErrors: { accessToken: ['Obligatorio'] } }
    }

    const values = {
      phoneNumberId: data.phoneNumberId,
      displayPhone: data.displayPhone ?? null,
      isActive: data.isActive === 'on',
      ...(data.accessToken ? { accessTokenEnc: encrypt(data.accessToken) } : {}),
    }
    await prisma.whatsAppConfig.upsert({
      where: { tenantId: user.tenantId },
      update: values,
      create: { ...values, accessTokenEnc: encrypt(data.accessToken!), tenantId: user.tenantId },
    })
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'whatsapp.config', entity: 'WhatsAppConfig', details: { isActive: values.isActive } })
    revalidatePath('/dashboard/whatsapp')
    return { ok: true, message: 'Configuración guardada' }
  } catch (error) {
    return toActionError(error)
  }
}

export async function sendTestMessage(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('whatsapp')
    const data = z
      .object({
        to: z.string({ required_error: 'Obligatorio' }).regex(/^\+?[0-9 ]{8,20}$/, 'Teléfono inválido'),
        template: z.string().regex(/^[a-z0-9_]{1,512}$/, 'Nombre de plantilla inválido').default('hello_world'),
        language: z.string().regex(/^[a-z]{2}(_[A-Z]{2})?$/, 'Código de idioma inválido (ej. es, en_US)').default('en_US'),
      })
      .parse(formToObject(formData))
    const id = await sendTemplate({ tenantId: user.tenantId, ...data })
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'whatsapp.test', entity: 'WhatsAppConfig', details: { to: data.to, template: data.template } })
    return { ok: true, message: `Mensaje enviado (id ${id ?? 'sin id'})` }
  } catch (error) {
    return toActionError(error)
  }
}
