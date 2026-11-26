'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireActionUser } from '@/lib/session'
import { audit } from '@/lib/audit'
import { formToObject, money, requiredNumber, toActionError, type ActionState } from '@/lib/actions'

const speed = requiredNumber((n) => n.int('Número entero').min(1, 'Mínimo 1 Mbps').max(100000))

const planSchema = z.object({
  name: z.string({ required_error: 'Obligatorio' }).max(100),
  description: z.string().max(500).optional(),
  download: speed,
  upload: speed,
  price: money,
})

export async function createPlan(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('plans')
    const data = planSchema.parse(formToObject(formData))
    const plan = await prisma.plan.create({ data: { ...data, tenantId: user.tenantId } })
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'plan.create', entity: 'Plan', entityId: plan.id })
    revalidatePath('/dashboard/plans')
    return { ok: true, message: 'Plan creado' }
  } catch (error) {
    return toActionError(error)
  }
}

export async function updatePlan(id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('plans')
    const data = planSchema.parse(formToObject(formData))
    const result = await prisma.plan.updateMany({
      where: { id, tenantId: user.tenantId },
      data: { ...data, description: data.description ?? null },
    })
    if (result.count === 0) throw new Error('El plan no existe.')
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'plan.update', entity: 'Plan', entityId: id })
  } catch (error) {
    return toActionError(error)
  }
  revalidatePath('/dashboard/plans')
  redirect('/dashboard/plans')
}

export async function togglePlan(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('plans')
    const id = z.string().parse(formData.get('id'))
    const plan = await prisma.plan.findFirst({ where: { id, tenantId: user.tenantId } })
    if (!plan) throw new Error('El plan no existe.')
    await prisma.plan.update({ where: { id }, data: { isActive: !plan.isActive } })
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'plan.toggle', entity: 'Plan', entityId: id })
    revalidatePath('/dashboard/plans')
    return { ok: true, message: plan.isActive ? 'Plan desactivado' : 'Plan activado' }
  } catch (error) {
    return toActionError(error)
  }
}

export async function deletePlan(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('plans')
    const id = z.string().parse(formData.get('id'))
    const plan = await prisma.plan.findFirst({ where: { id, tenantId: user.tenantId }, include: { _count: { select: { services: true } } } })
    if (!plan) throw new Error('El plan no existe.')
    if (plan._count.services > 0) throw new Error('El plan tiene servicios asignados. Desactívalo en lugar de eliminarlo.')
    await prisma.plan.delete({ where: { id } })
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'plan.delete', entity: 'Plan', entityId: id })
    revalidatePath('/dashboard/plans')
    return { ok: true, message: 'Plan eliminado' }
  } catch (error) {
    return toActionError(error)
  }
}
