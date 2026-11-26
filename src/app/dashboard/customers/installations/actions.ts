'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireActionUser } from '@/lib/session'
import { audit } from '@/lib/audit'
import { formToObject, toActionError, type ActionState } from '@/lib/actions'
import { localInputToInstant } from '@/lib/dates'

async function assertTechnician(tenantId: string, id?: string) {
  if (!id) return
  const u = await prisma.user.findFirst({ where: { id, tenantId, isActive: true } })
  if (!u) throw new Error('El técnico elegido no existe o está inactivo.')
}

export async function scheduleInstallation(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('installations')
    const data = z
      .object({
        customerId: z.string({ required_error: 'Elige el cliente' }),
        scheduledAt: z.string({ required_error: 'Obligatorio' }),
        technicianId: z.string().optional(),
        notes: z.string().max(1000).optional(),
      })
      .parse(formToObject(formData))
    const customer = await prisma.customer.findFirst({ where: { id: data.customerId, tenantId: user.tenantId } })
    if (!customer) throw new Error('El cliente no existe.')
    await assertTechnician(user.tenantId, data.technicianId)
    const scheduledAt = localInputToInstant(data.scheduledAt, user.tenant.timezone)
    const open = await prisma.installation.findFirst({ where: { customerId: customer.id, status: { in: ['SCHEDULED', 'IN_PROGRESS'] } } })
    if (open) throw new Error('El cliente ya tiene una instalación abierta. Reprográmala o complétala.')
    const inst = await prisma.installation.create({
      data: { tenantId: user.tenantId, customerId: customer.id, scheduledAt, technicianId: data.technicianId, notes: data.notes, createdById: user.id },
    })
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'installation.create', entity: 'Customer', entityId: customer.id, details: { installationId: inst.id } })
    revalidatePath('/dashboard/customers/installations')
    return { ok: true, message: 'Instalación programada' }
  } catch (error) {
    return toActionError(error)
  }
}

export async function updateInstallation(id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('installations')
    const data = z
      .object({ scheduledAt: z.string({ required_error: 'Obligatorio' }), technicianId: z.string().optional(), notes: z.string().max(1000).optional() })
      .parse(formToObject(formData))
    const inst = await prisma.installation.findFirst({ where: { id, tenantId: user.tenantId } })
    if (!inst) throw new Error('La instalación no existe.')
    if (inst.status === 'DONE' || inst.status === 'CANCELLED') throw new Error('La instalación ya está cerrada.')
    await assertTechnician(user.tenantId, data.technicianId)
    await prisma.installation.update({
      where: { id },
      data: { scheduledAt: localInputToInstant(data.scheduledAt, user.tenant.timezone), technicianId: data.technicianId ?? null, notes: data.notes ?? null },
    })
    revalidatePath('/dashboard/customers/installations')
    return { ok: true, message: 'Instalación actualizada' }
  } catch (error) {
    return toActionError(error)
  }
}

export async function setInstallationStatus(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('installations')
    const { id, status } = z.object({ id: z.string(), status: z.enum(['IN_PROGRESS', 'CANCELLED']) }).parse(formToObject(formData))
    const inst = await prisma.installation.findFirst({ where: { id, tenantId: user.tenantId } })
    if (!inst) throw new Error('La instalación no existe.')
    if (inst.status === 'DONE' || inst.status === 'CANCELLED') throw new Error('La instalación ya está cerrada.')
    await prisma.installation.update({ where: { id }, data: { status } })
    await audit({ tenantId: user.tenantId, userId: user.id, action: `installation.${status.toLowerCase()}`, entity: 'Customer', entityId: inst.customerId })
    revalidatePath('/dashboard/customers/installations')
    return { ok: true, message: status === 'IN_PROGRESS' ? 'Instalación en curso' : 'Instalación cancelada' }
  } catch (error) {
    return toActionError(error)
  }
}

/**
 * Completa la instalación: el cliente "pendiente de instalación" pasa a ACTIVO y la fecha de
 * instalación de sus servicios queda en hoy (así empieza a facturarse desde su siguiente ciclo).
 */
export async function completeInstallation(id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('installations')
    const notes = z.string().max(1000).optional().parse(formToObject(formData).completionNotes)
    const inst = await prisma.installation.findFirst({ where: { id, tenantId: user.tenantId }, include: { customer: true } })
    if (!inst) throw new Error('La instalación no existe.')
    if (inst.status === 'DONE' || inst.status === 'CANCELLED') throw new Error('La instalación ya está cerrada.')
    const now = new Date()
    await prisma.$transaction(async (tx) => {
      await tx.installation.update({ where: { id }, data: { status: 'DONE', completedAt: now, completionNotes: notes, technicianId: inst.technicianId ?? user.id } })
      if (inst.customer.status === 'PENDING') {
        await tx.customer.update({ where: { id: inst.customerId }, data: { status: 'ACTIVE' } })
        await tx.service.updateMany({ where: { customerId: inst.customerId, isActive: true }, data: { installedAt: now } })
      }
    })
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'installation.done', entity: 'Customer', entityId: inst.customerId })
    revalidatePath('/dashboard/customers/installations')
    revalidatePath(`/dashboard/customers/${inst.customerId}`)
    return { ok: true, message: inst.customer.status === 'PENDING' ? 'Instalación completada · cliente activado' : 'Instalación completada' }
  } catch (error) {
    return toActionError(error)
  }
}
