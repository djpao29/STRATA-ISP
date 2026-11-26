'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireActionUser } from '@/lib/session'
import { audit } from '@/lib/audit'
import { encrypt } from '@/lib/crypto'
import { HOST_REGEX } from '@/lib/net'
import { formToObject, toActionError, type ActionState } from '@/lib/actions'

const oltSchema = z.object({
  name: z.string({ required_error: 'Obligatorio' }).max(100),
  host: z.string({ required_error: 'Obligatorio' }).regex(HOST_REGEX, 'IP o nombre de host inválido'),
  port: z.coerce.number().int().min(1).max(65535).default(161),
  vendor: z.string().max(50).optional(),
  community: z.string().max(100).optional(),
  status: z.enum(['ONLINE', 'OFFLINE', 'UNKNOWN']).default('UNKNOWN'),
})

export async function createOlt(_: ActionState, formData: FormData): Promise<ActionState> {
  let id: string
  try {
    const user = await requireActionUser('olt')
    const { community, ...data } = oltSchema.parse(formToObject(formData))
    if (!community) return { error: 'Revisa los campos marcados.', fieldErrors: { community: ['Obligatorio'] } }
    const olt = await prisma.oLT.create({ data: { ...data, communityEnc: encrypt(community), tenantId: user.tenantId } })
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'olt.create', entity: 'OLT', entityId: olt.id })
    id = olt.id
  } catch (error) {
    return toActionError(error)
  }
  revalidatePath('/dashboard/olt')
  redirect(`/dashboard/olt/${id}`)
}

export async function updateOlt(id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('olt')
    const { community, ...data } = oltSchema.parse(formToObject(formData))
    const olt = await prisma.oLT.findFirst({ where: { id, tenantId: user.tenantId } })
    if (!olt) throw new Error('La OLT no existe.')
    await prisma.oLT.update({
      where: { id },
      data: { ...data, vendor: data.vendor ?? null, ...(community ? { communityEnc: encrypt(community) } : {}) },
    })
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'olt.update', entity: 'OLT', entityId: id })
    revalidatePath(`/dashboard/olt/${id}`)
    revalidatePath('/dashboard/olt')
    return { ok: true, message: 'OLT actualizada' }
  } catch (error) {
    return toActionError(error)
  }
}

export async function deleteOlt(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('olt')
    const id = z.string().parse(formData.get('id'))
    const olt = await prisma.oLT.findFirst({ where: { id, tenantId: user.tenantId }, include: { _count: { select: { onus: true } } } })
    if (!olt) throw new Error('La OLT no existe.')
    if (olt._count.onus > 0) throw new Error('La OLT tiene ONUs registradas. Elimínalas o muévelas antes.')
    await prisma.oLT.delete({ where: { id } })
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'olt.delete', entity: 'OLT', entityId: id })
  } catch (error) {
    return toActionError(error)
  }
  revalidatePath('/dashboard/olt')
  redirect('/dashboard/olt')
}

const onuSchema = z.object({
  serial: z
    .string({ required_error: 'Obligatorio' })
    .regex(/^[A-Za-z0-9]{8,20}$/, 'Serial de 8 a 20 caracteres alfanuméricos')
    .transform((v) => v.toUpperCase()),
  name: z.string().max(100).optional(),
  slot: z.coerce.number().int().min(0).max(64),
  port: z.coerce.number().int().min(0).max(128),
  onuIndex: z.coerce.number().int().min(0).max(256).optional(),
  customerId: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'LOS']).default('ACTIVE'),
})

export async function addOnu(oltId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('olt')
    const data = onuSchema.parse(formToObject(formData))
    const olt = await prisma.oLT.findFirst({ where: { id: oltId, tenantId: user.tenantId } })
    if (!olt) throw new Error('La OLT no existe.')
    if (data.customerId) {
      const c = await prisma.customer.findFirst({ where: { id: data.customerId, tenantId: user.tenantId } })
      if (!c) throw new Error('El cliente no existe.')
    }
    const onu = await prisma.oNU.create({ data: { ...data, oltId } })
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'onu.create', entity: 'ONU', entityId: onu.id, details: { serial: onu.serial } })
    revalidatePath(`/dashboard/olt/${oltId}`)
    return { ok: true, message: 'ONU registrada' }
  } catch (error) {
    return toActionError(error)
  }
}

export async function setOnuStatus(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('olt')
    const { id, status } = z
      .object({ id: z.string(), status: z.enum(['ACTIVE', 'INACTIVE', 'LOS']) })
      .parse({ id: formData.get('id'), status: formData.get('status') })
    const onu = await prisma.oNU.findFirst({ where: { id, olt: { tenantId: user.tenantId } } })
    if (!onu) throw new Error('La ONU no existe.')
    await prisma.oNU.update({ where: { id }, data: { status } })
    revalidatePath(`/dashboard/olt/${onu.oltId}`)
    return { ok: true, message: 'Estado de la ONU actualizado' }
  } catch (error) {
    return toActionError(error)
  }
}

export async function deleteOnu(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('olt')
    const id = z.string().parse(formData.get('id'))
    const onu = await prisma.oNU.findFirst({ where: { id, olt: { tenantId: user.tenantId } } })
    if (!onu) throw new Error('La ONU no existe.')
    await prisma.oNU.delete({ where: { id } })
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'onu.delete', entity: 'ONU', entityId: id, details: { serial: onu.serial } })
    revalidatePath(`/dashboard/olt/${onu.oltId}`)
    return { ok: true, message: 'ONU eliminada' }
  } catch (error) {
    return toActionError(error)
  }
}
