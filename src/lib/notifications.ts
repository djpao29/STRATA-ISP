import type { CustomerStatus, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { sendTemplate } from '@/lib/whatsapp'
import { pendingByCustomer } from '@/lib/collections'
import { formatCurrency, formatDate } from '@/lib/format'
import { formatCustomerCode } from '@/lib/zones/billing'

/** Variables que se pueden usar en los parámetros de la plantilla. */
export const TEMPLATE_VARIABLES = {
  '{nombre}': 'Nombre',
  '{apellido}': 'Apellido',
  '{nombre_completo}': 'Nombre y apellido',
  '{codigo}': 'Código del cliente',
  '{saldo}': 'Saldo pendiente',
  '{facturas}': 'Facturas pendientes',
  '{fecha_vencimiento}': 'Vencimiento de la factura más antigua',
  '{fecha_corte}': 'Próxima fecha de corte',
  '{plan}': 'Plan contratado',
  '{empresa}': 'Nombre de la empresa',
} as const

export type Audience =
  | { type: 'all' }
  | { type: 'active' }
  | { type: 'debtors' }
  | { type: 'suspended' }
  | { type: 'zone'; zoneId: string }
  | { type: 'customer'; customerId: string }

/** Reemplaza las variables conocidas; las desconocidas se dejan como están. */
export function fillParams(params: string[], vars: Record<string, string>) {
  return params.map((p) => p.replace(/\{[a-z_]+\}/g, (m) => (m in vars ? vars[m] : m)))
}

/** Variables sin valor disponible se reemplazan por esto (WhatsApp rechaza parámetros vacíos). */
const EMPTY = '—'

const MAX_ATTEMPTS = 3

function audienceWhere(tenantId: string, a: Audience): Prisma.CustomerWhereInput {
  const base: Prisma.CustomerWhereInput = { tenantId }
  switch (a.type) {
    case 'all':
      return { ...base, status: { not: 'CANCELLED' } }
    case 'active':
      return { ...base, status: 'ACTIVE' }
    case 'suspended':
      return { ...base, status: 'SUSPENDED' }
    case 'debtors':
      return { ...base, status: { not: 'CANCELLED' }, invoices: { some: { status: { in: ['PENDING', 'OVERDUE'] } } } }
    case 'zone':
      return { ...base, status: { not: 'CANCELLED' }, zoneId: a.zoneId }
    case 'customer':
      return { ...base, id: a.customerId }
  }
}

export function audienceLabel(a: Audience, names: { zone?: string; customer?: string } = {}) {
  switch (a.type) {
    case 'all':
      return 'Todos los clientes (no cancelados)'
    case 'active':
      return 'Clientes activos'
    case 'suspended':
      return 'Clientes cortados'
    case 'debtors':
      return 'Clientes con deuda'
    case 'zone':
      return `Zona ${names.zone ?? ''}`.trim()
    case 'customer':
      return `Cliente ${names.customer ?? ''}`.trim()
  }
}

/** Clientes que recibirían la campaña, con las variables ya calculadas. */
export async function resolveAudience(tenantId: string, audience: Audience) {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true, currency: true, timezone: true } })
  const customers = await prisma.customer.findMany({
    where: audienceWhere(tenantId, audience),
    select: {
      id: true,
      code: true,
      firstName: true,
      lastName: true,
      phone: true,
      status: true,
      services: { where: { isActive: true }, select: { plan: { select: { name: true } } }, take: 1 },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })
  const debts = new Map((await pendingByCustomer(tenantId, tenant.timezone)).map((d) => [d.id, d]))
  return customers.map((c) => {
    const d = debts.get(c.id)
    const vars: Record<string, string> = {
      '{nombre}': c.firstName,
      '{apellido}': c.lastName,
      '{nombre_completo}': `${c.firstName} ${c.lastName}`,
      '{codigo}': formatCustomerCode(c.code),
      '{saldo}': formatCurrency(d?.balance ?? 0, tenant.currency),
      '{facturas}': String(d?.invoices ?? 0),
      '{fecha_vencimiento}': d ? formatDate(d.oldestDue) : EMPTY,
      '{fecha_corte}': d?.nextCut ? formatDate(d.nextCut) : EMPTY,
      '{plan}': c.services[0]?.plan.name ?? EMPTY,
      '{empresa}': tenant.name,
    }
    return { id: c.id, name: `${c.firstName} ${c.lastName}`, phone: c.phone?.trim() ?? '', status: c.status as CustomerStatus, vars }
  })
}

/** Crea la campaña con un destinatario por cliente. Los que no tienen teléfono quedan como omitidos. */
export async function createCampaign(input: {
  tenantId: string
  userId: string
  name: string
  template: string
  language: string
  params: string[]
  audience: Audience
  audienceText: string
}) {
  const people = await resolveAudience(input.tenantId, input.audience)
  if (people.length === 0) throw new Error('Ningún cliente coincide con ese filtro.')
  const withPhone = people.filter((p) => /\d{7,}/.test(p.phone.replace(/\D/g, '')))
  if (withPhone.length === 0) throw new Error('Ninguno de esos clientes tiene teléfono registrado.')

  return prisma.notificationCampaign.create({
    data: {
      tenantId: input.tenantId,
      createdById: input.userId,
      name: input.name,
      template: input.template,
      language: input.language,
      params: input.params,
      audience: input.audienceText,
      recipients: {
        create: people.map((p) => {
          const ok = withPhone.includes(p)
          return {
            customerId: p.id,
            phone: p.phone || EMPTY,
            params: fillParams(input.params, p.vars),
            status: ok ? ('PENDING' as const) : ('SKIPPED' as const),
            error: ok ? null : 'Sin teléfono válido',
          }
        }),
      },
    },
    include: { _count: { select: { recipients: true } } },
  })
}

/**
 * Envía los mensajes pendientes (de una campaña o de todas). Cada destinatario se "reserva"
 * con una actualización condicional, así dos procesos nunca envían el mismo mensaje.
 * Los fallos se reintentan en los siguientes ciclos hasta 3 veces.
 */
export async function processCampaigns(opts: { campaignId?: string; limit?: number } = {}) {
  const pending = await prisma.notificationRecipient.findMany({
    where: { status: 'PENDING', campaign: { status: 'SENDING', ...(opts.campaignId ? { id: opts.campaignId } : {}) } },
    include: { campaign: { select: { id: true, tenantId: true, template: true, language: true } } },
    orderBy: { id: 'asc' },
    take: opts.limit ?? 100,
  })
  let sent = 0
  let failed = 0
  const touched = new Set<string>()
  for (const r of pending) {
    const claim = await prisma.notificationRecipient.updateMany({
      where: { id: r.id, status: 'PENDING', attempts: r.attempts },
      data: { attempts: { increment: 1 } },
    })
    if (claim.count === 0) continue // otro proceso lo tomó
    touched.add(r.campaign.id)
    try {
      // Comprobación justo antes de enviar: la campaña pudo cancelarse.
      const c = await prisma.notificationCampaign.findUnique({ where: { id: r.campaign.id }, select: { status: true } })
      if (c?.status !== 'SENDING') continue
      const messageId = await sendTemplate({
        tenantId: r.campaign.tenantId,
        to: r.phone,
        template: r.campaign.template,
        language: r.campaign.language,
        bodyParams: Array.isArray(r.params) ? (r.params as string[]) : [],
      })
      await prisma.notificationRecipient.update({ where: { id: r.id }, data: { status: 'SENT', messageId: messageId ?? null, sentAt: new Date(), error: null } })
      sent++
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : 'Error desconocido'
      // Sin configuración no tiene sentido reintentar.
      const final = r.attempts + 1 >= MAX_ATTEMPTS || /no está configurado|está desactivada/.test(message)
      await prisma.notificationRecipient.update({ where: { id: r.id }, data: { status: final ? 'FAILED' : 'PENDING', error: message } })
      if (final) failed++
    }
  }
  for (const id of touched) await finishIfDone(id)
  return { sent, failed }
}

/** Cierra la campaña cuando ya no le quedan mensajes pendientes. */
export async function finishIfDone(campaignId: string) {
  const left = await prisma.notificationRecipient.count({ where: { campaignId, status: 'PENDING' } })
  if (left === 0) {
    await prisma.notificationCampaign.updateMany({ where: { id: campaignId, status: 'SENDING' }, data: { status: 'DONE', finishedAt: new Date() } })
  }
}
