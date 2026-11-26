'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireActionUser } from '@/lib/session'
import { audit } from '@/lib/audit'
import { formToObject, toActionError, type ActionState } from '@/lib/actions'

const priority = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
const status = z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'])

async function assertAssignee(tenantId: string, userId?: string) {
  if (!userId) return
  const u = await prisma.user.findFirst({ where: { id: userId, tenantId, isActive: true } })
  if (!u) throw new Error('El usuario asignado no existe o está inactivo.')
}

export async function createTicket(_: ActionState, formData: FormData): Promise<ActionState> {
  let id: string
  try {
    const user = await requireActionUser('support')
    const data = z
      .object({
        customerId: z.string({ required_error: 'Elige un cliente' }),
        title: z.string({ required_error: 'Obligatorio' }).max(200),
        description: z.string({ required_error: 'Obligatorio' }).max(5000),
        priority: priority.default('MEDIUM'),
        assignedTo: z.string().optional(),
      })
      .parse(formToObject(formData))
    const customer = await prisma.customer.findFirst({ where: { id: data.customerId, tenantId: user.tenantId } })
    if (!customer) throw new Error('El cliente no existe.')
    await assertAssignee(user.tenantId, data.assignedTo)
    const ticket = await prisma.ticket.create({ data: { ...data, tenantId: user.tenantId } })
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'ticket.create', entity: 'Ticket', entityId: ticket.id })
    id = ticket.id
  } catch (error) {
    return toActionError(error)
  }
  revalidatePath('/dashboard/support')
  redirect(`/dashboard/support/${id}`)
}

export async function updateTicket(id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('support')
    const data = z
      .object({ status, priority, assignedTo: z.string().optional() })
      .parse(formToObject(formData))
    const ticket = await prisma.ticket.findFirst({ where: { id, tenantId: user.tenantId } })
    if (!ticket) throw new Error('El ticket no existe.')
    await assertAssignee(user.tenantId, data.assignedTo)

    const closing = (data.status === 'RESOLVED' || data.status === 'CLOSED') && !ticket.closedAt
    const reopening = (data.status === 'OPEN' || data.status === 'IN_PROGRESS') && ticket.closedAt
    await prisma.ticket.update({
      where: { id },
      data: {
        status: data.status,
        priority: data.priority,
        assignedTo: data.assignedTo ?? null,
        ...(closing ? { closedAt: new Date() } : reopening ? { closedAt: null } : {}),
      },
    })
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'ticket.update', entity: 'Ticket', entityId: id, details: data })
    revalidatePath(`/dashboard/support/${id}`)
    revalidatePath('/dashboard/support')
    return { ok: true, message: 'Ticket actualizado' }
  } catch (error) {
    return toActionError(error)
  }
}

export async function addComment(ticketId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('support')
    const message = z
      .string({ required_error: 'Escribe un comentario' })
      .max(5000)
      .parse(formToObject(formData).message)
    const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, tenantId: user.tenantId } })
    if (!ticket) throw new Error('El ticket no existe.')
    await prisma.ticketComment.create({ data: { ticketId, userId: user.id, message } })
    revalidatePath(`/dashboard/support/${ticketId}`)
    return { ok: true, message: 'Comentario agregado' }
  } catch (error) {
    return toActionError(error)
  }
}
