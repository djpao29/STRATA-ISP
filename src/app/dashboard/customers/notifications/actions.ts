'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireActionUser } from '@/lib/session'
import { audit } from '@/lib/audit'
import { formToObject, toActionError, type ActionState } from '@/lib/actions'
import { audienceLabel, createCampaign, finishIfDone, processCampaigns, resolveAudience, type Audience } from '@/lib/notifications'

const PATH = '/dashboard/customers/notifications'

const audienceSchema = z.object({
  audience: z.enum(['all', 'active', 'debtors', 'suspended', 'zone', 'customer'], { required_error: 'Elige a quién enviar' }),
  zoneId: z.string().optional(),
  customerId: z.string().optional(),
})

async function parseAudience(tenantId: string, raw: z.infer<typeof audienceSchema>): Promise<{ audience: Audience; text: string }> {
  if (raw.audience === 'zone') {
    if (!raw.zoneId) throw new z.ZodError([{ code: 'custom', path: ['zoneId'], message: 'Elige la zona' }])
    const zone = await prisma.zone.findFirst({ where: { id: raw.zoneId, tenantId } })
    if (!zone) throw new Error('La zona no existe.')
    const audience: Audience = { type: 'zone', zoneId: zone.id }
    return { audience, text: audienceLabel(audience, { zone: zone.name }) }
  }
  if (raw.audience === 'customer') {
    if (!raw.customerId) throw new z.ZodError([{ code: 'custom', path: ['customerId'], message: 'Elige el cliente' }])
    const c = await prisma.customer.findFirst({ where: { id: raw.customerId, tenantId } })
    if (!c) throw new Error('El cliente no existe.')
    const audience: Audience = { type: 'customer', customerId: c.id }
    return { audience, text: audienceLabel(audience, { customer: `${c.firstName} ${c.lastName}` }) }
  }
  const audience = { type: raw.audience } as Audience
  return { audience, text: audienceLabel(audience) }
}

/** Calcula cuántos clientes recibirían el mensaje y muestra el primero ya con las variables reemplazadas. */
export async function previewAudience(input: { audience: string; zoneId?: string; customerId?: string; params: string }) {
  try {
    const user = await requireActionUser('notifications')
    const raw = audienceSchema.parse({ audience: input.audience, zoneId: input.zoneId || undefined, customerId: input.customerId || undefined })
    const { audience } = await parseAudience(user.tenantId, raw)
    const people = await resolveAudience(user.tenantId, audience)
    const withPhone = people.filter((p) => /\d{7,}/.test(p.phone.replace(/\D/g, '')))
    const params = input.params.split('\n').map((l) => l.trim()).filter(Boolean)
    const first = withPhone[0]
    return {
      total: people.length,
      withPhone: withPhone.length,
      sample: first ? { name: first.name, phone: first.phone, params: params.map((p) => p.replace(/\{[a-z_]+\}/g, (m) => first.vars[m] ?? m)) } : null,
    }
  } catch (error) {
    const e = toActionError(error)
    return { error: e.fieldErrors ? Object.values(e.fieldErrors).flat()[0] ?? e.error : e.error }
  }
}

export async function sendCampaign(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('notifications')
    const obj = formToObject(formData)
    const data = z
      .object({
        name: z.string({ required_error: 'Obligatorio' }).max(120),
        template: z.string({ required_error: 'Obligatorio' }).regex(/^[a-z0-9_]{1,512}$/, 'Solo minúsculas, números y guion bajo (como está en Meta)'),
        language: z.string().regex(/^[a-z]{2}(_[A-Z]{2})?$/, 'Código de idioma inválido (ej. es, es_MX, en_US)').default('es'),
        params: z.string().max(4000).optional(),
      })
      .merge(audienceSchema)
      .parse(obj)

    const wa = await prisma.whatsAppConfig.findUnique({ where: { tenantId: user.tenantId } })
    if (!wa?.isActive) throw new Error('WhatsApp no está configurado o está desactivado. Actívalo en Integraciones → WhatsApp.')

    const params = (data.params ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
    if (params.length > 10) throw new Error('Máximo 10 parámetros.')
    const { audience, text } = await parseAudience(user.tenantId, data)
    const campaign = await createCampaign({
      tenantId: user.tenantId,
      userId: user.id,
      name: data.name,
      template: data.template,
      language: data.language,
      params,
      audience,
      audienceText: text,
    })
    await finishIfDone(campaign.id)
    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'notification.campaign',
      entity: 'NotificationCampaign',
      entityId: campaign.id,
      details: { audience: text, template: data.template, recipients: campaign._count.recipients },
    })
    // Envío en segundo plano; lo que quede (o falle) lo retoma el ciclo de tareas cada minuto.
    void processCampaigns({ campaignId: campaign.id, limit: 1000 })
      .catch((e) => console.error('[notificaciones] envío', e))
    revalidatePath(PATH)
    return { ok: true, message: `Campaña creada: ${campaign._count.recipients} destinatarios. Enviando…` }
  } catch (error) {
    return toActionError(error)
  }
}

export async function cancelCampaign(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('notifications')
    const { id } = z.object({ id: z.string() }).parse(formToObject(formData))
    const c = await prisma.notificationCampaign.findFirst({ where: { id, tenantId: user.tenantId } })
    if (!c) throw new Error('La campaña no existe.')
    if (c.status !== 'SENDING') throw new Error('La campaña ya terminó.')
    await prisma.$transaction([
      prisma.notificationCampaign.update({ where: { id }, data: { status: 'CANCELLED', finishedAt: new Date() } }),
      prisma.notificationRecipient.updateMany({ where: { campaignId: id, status: 'PENDING' }, data: { status: 'SKIPPED', error: 'Campaña cancelada' } }),
    ])
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'notification.cancel', entity: 'NotificationCampaign', entityId: id })
    revalidatePath(PATH)
    revalidatePath(`${PATH}/${id}`)
    return { ok: true, message: 'Campaña cancelada' }
  } catch (error) {
    return toActionError(error)
  }
}

/** Vuelve a poner en cola los mensajes fallidos de una campaña. */
export async function retryFailed(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('notifications')
    const { id } = z.object({ id: z.string() }).parse(formToObject(formData))
    const c = await prisma.notificationCampaign.findFirst({ where: { id, tenantId: user.tenantId } })
    if (!c) throw new Error('La campaña no existe.')
    const wa = await prisma.whatsAppConfig.findUnique({ where: { tenantId: user.tenantId } })
    if (!wa?.isActive) throw new Error('WhatsApp no está configurado o está desactivado.')
    const r = await prisma.notificationRecipient.updateMany({ where: { campaignId: id, status: 'FAILED' }, data: { status: 'PENDING', attempts: 0, error: null } })
    if (r.count === 0) throw new Error('No hay mensajes fallidos.')
    await prisma.notificationCampaign.update({ where: { id }, data: { status: 'SENDING', finishedAt: null } })
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'notification.retry', entity: 'NotificationCampaign', entityId: id, details: { count: r.count } })
    void processCampaigns({ campaignId: id, limit: 1000 })
      .catch((e) => console.error('[notificaciones] reintento', e))
    revalidatePath(PATH)
    revalidatePath(`${PATH}/${id}`)
    return { ok: true, message: `${r.count} mensajes en cola de nuevo` }
  } catch (error) {
    return toActionError(error)
  }
}
