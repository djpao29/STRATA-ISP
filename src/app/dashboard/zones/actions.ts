'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireActionUser } from '@/lib/session'
import { audit } from '@/lib/audit'
import { formToObject, requiredNumber, toActionError, type ActionState } from '@/lib/actions'
import { validateRules } from '@/lib/zones/cycle'
import { runTenantJobs } from '@/lib/jobs/scheduler'
import { processNetworkActions } from '@/lib/zones/network'

const day = requiredNumber((n) => n.int('Número entero').min(1, 'Entre 1 y 31').max(31, 'Entre 1 y 31'))
const hour = requiredNumber((n) => n.int('Número entero').min(0, 'Entre 0 y 23').max(23, 'Entre 0 y 23'))
const flag = z.literal('on').optional()

const zoneSchema = z.object({
  name: z.string({ required_error: 'Obligatorio' }).max(60),
  invoiceDay: day,
  dueDay: day,
  suspendDay: day,
  invoiceHour: hour,
  suspendHour: hour,
  suspendAfterInvoices: requiredNumber((n) => n.int().min(1, 'Mínimo 1').max(12, 'Máximo 12')),
  isActive: flag,
  autoInvoice: flag,
  autoSuspend: flag,
  autoReconnect: flag,
  invoiceSuspended: flag,
})

function parseZone(formData: FormData) {
  const raw = zoneSchema.parse(formToObject(formData))
  const errors = validateRules(raw)
  if (Object.keys(errors).length) {
    throw new z.ZodError(Object.entries(errors).map(([k, m]) => ({ code: 'custom', path: [k], message: m })))
  }
  return {
    ...raw,
    isActive: raw.isActive === 'on',
    autoInvoice: raw.autoInvoice === 'on',
    autoSuspend: raw.autoSuspend === 'on',
    autoReconnect: raw.autoReconnect === 'on',
    invoiceSuspended: raw.invoiceSuspended === 'on',
  }
}

export async function createZone(_: ActionState, formData: FormData): Promise<ActionState> {
  let id: string
  try {
    const user = await requireActionUser('zonesWrite')
    const data = parseZone(formData)
    const zone = await prisma.zone.create({ data: { ...data, tenantId: user.tenantId } })
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'zone.create', entity: 'Zone', entityId: zone.id, details: data })
    id = zone.id
  } catch (error) {
    return toActionError(error)
  }
  revalidatePath('/dashboard/zones')
  redirect(`/dashboard/zones/${id}`)
}

export async function updateZone(id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('zonesWrite')
    const data = parseZone(formData)
    const before = await prisma.zone.findFirst({ where: { id, tenantId: user.tenantId } })
    if (!before) throw new Error('La zona no existe.')
    await prisma.zone.update({ where: { id }, data })
    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'zone.update',
      entity: 'Zone',
      entityId: id,
      details: { before: { invoiceDay: before.invoiceDay, dueDay: before.dueDay, suspendDay: before.suspendDay }, after: data },
    })
  } catch (error) {
    return toActionError(error)
  }
  revalidatePath('/dashboard/zones')
  redirect(`/dashboard/zones/${id}`)
}

/** Ejecuta ahora el ciclo de facturación, cortes y reconexiones (lo mismo que hace la tarea programada). */
export async function runJobsNow(_: ActionState): Promise<ActionState> {
  try {
    const user = await requireActionUser('zonesWrite')
    const { ok, summary } = await runTenantJobs(user.tenantId)
    const net = await processNetworkActions({ limit: 50 })
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'zones.run_now', entity: 'Zone', details: { ok } })
    revalidatePath('/dashboard/zones', 'layout')
    if (!ok) return { error: `La ejecución terminó con errores: ${String(summary.error ?? '')}` }
    const billing = (summary.billing as Array<{ created: number }>) ?? []
    const created = billing.reduce((s, b) => s + b.created, 0)
    const suspended = (summary.suspensions as { suspended: number }).suspended
    const reconnected = (summary.reconnections as { reconnected: number }).reconnected
    return {
      ok: true,
      message: `Listo: ${created} facturas nuevas, ${suspended} cortes, ${reconnected} reconexiones, ${net.done} acciones aplicadas en routers.`,
    }
  } catch (error) {
    return toActionError(error)
  }
}

/** Reintentar una acción fallida o cancelar una pendiente. */
export async function manageAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('zonesWrite')
    const { id, op } = z.object({ id: z.string(), op: z.enum(['retry', 'cancel']) }).parse(formToObject(formData))
    const action = await prisma.networkAction.findFirst({ where: { id, tenantId: user.tenantId } })
    if (!action) throw new Error('La acción no existe.')
    if (op === 'retry') {
      if (action.status !== 'FAILED' && action.status !== 'PENDING') throw new Error('Solo se pueden reintentar acciones fallidas o pendientes.')
      await prisma.networkAction.update({ where: { id }, data: { status: 'PENDING', nextAttemptAt: new Date(), lastError: null } })
      await processNetworkActions({ customerId: action.customerId })
    } else {
      if (action.status !== 'PENDING' && action.status !== 'FAILED') throw new Error('Solo se pueden cancelar acciones pendientes o fallidas.')
      await prisma.networkAction.update({ where: { id }, data: { status: 'CANCELLED', finishedAt: new Date(), lastError: 'Cancelada por un usuario' } })
    }
    await audit({ tenantId: user.tenantId, userId: user.id, action: `network_action.${op}`, entity: 'NetworkAction', entityId: id })
    revalidatePath('/dashboard/zones/log')
    revalidatePath(`/dashboard/customers/${action.customerId}`)
    const updated = await prisma.networkAction.findUnique({ where: { id } })
    if (op === 'retry' && updated?.status !== 'DONE') return { error: `Reintento sin éxito: ${updated?.lastError ?? 'pendiente'}` }
    return { ok: true, message: op === 'retry' ? 'Acción aplicada en el router' : 'Acción cancelada' }
  } catch (error) {
    return toActionError(error)
  }
}
