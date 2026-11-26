'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { UserRole } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { currentUser, requireActionUser } from '@/lib/session'
import { audit } from '@/lib/audit'
import { formToObject, toActionError, type ActionState } from '@/lib/actions'
import { localInputToInstant } from '@/lib/dates'

const ROLES: UserRole[] = ['ADMIN', 'MANAGER', 'TECHNICIAN', 'BILLING']

function refresh() {
  revalidatePath('/dashboard', 'layout')
}

/** Crea (id null) o edita un aviso. */
export async function saveNotice(id: string | null, _: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('notices')
    const data = z
      .object({
        title: z.string({ required_error: 'Obligatorio' }).max(120),
        message: z.string({ required_error: 'Obligatorio' }).max(2000),
        severity: z.enum(['INFO', 'WARNING', 'CRITICAL']).default('INFO'),
        startsAt: z.string().optional(),
        endsAt: z.string().optional(),
        dismissible: z.literal('on').optional(),
      })
      .parse(formToObject(formData))
    const roles = formData.getAll('roles').filter((r): r is UserRole => ROLES.includes(r as UserRole))
    const tz = user.tenant.timezone
    const startsAt = data.startsAt ? localInputToInstant(data.startsAt, tz) : new Date()
    const endsAt = data.endsAt ? localInputToInstant(data.endsAt, tz) : null
    if (endsAt && endsAt <= startsAt) {
      return { error: 'Revisa los campos marcados.', fieldErrors: { endsAt: ['Debe ser posterior al inicio'] } }
    }
    const values = { title: data.title, message: data.message, severity: data.severity, roles, startsAt, endsAt, dismissible: data.dismissible === 'on' }

    if (id) {
      const n = await prisma.screenNotice.findFirst({ where: { id, tenantId: user.tenantId } })
      if (!n) throw new Error('El aviso no existe.')
      await prisma.screenNotice.update({ where: { id }, data: values })
      await audit({ tenantId: user.tenantId, userId: user.id, action: 'notice.update', entity: 'ScreenNotice', entityId: id })
    } else {
      const n = await prisma.screenNotice.create({ data: { ...values, tenantId: user.tenantId, createdById: user.id } })
      await audit({ tenantId: user.tenantId, userId: user.id, action: 'notice.create', entity: 'ScreenNotice', entityId: n.id })
    }
    refresh()
    return { ok: true, message: id ? 'Aviso actualizado' : 'Aviso publicado' }
  } catch (error) {
    return toActionError(error)
  }
}

export async function toggleNotice(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('notices')
    const { id } = z.object({ id: z.string() }).parse(formToObject(formData))
    const n = await prisma.screenNotice.findFirst({ where: { id, tenantId: user.tenantId } })
    if (!n) throw new Error('El aviso no existe.')
    await prisma.screenNotice.update({ where: { id }, data: { isActive: !n.isActive } })
    await audit({ tenantId: user.tenantId, userId: user.id, action: n.isActive ? 'notice.deactivate' : 'notice.activate', entity: 'ScreenNotice', entityId: id })
    refresh()
    return { ok: true, message: n.isActive ? 'Aviso desactivado' : 'Aviso activado' }
  } catch (error) {
    return toActionError(error)
  }
}

export async function deleteNotice(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('notices')
    const { id } = z.object({ id: z.string() }).parse(formToObject(formData))
    const n = await prisma.screenNotice.findFirst({ where: { id, tenantId: user.tenantId } })
    if (!n) throw new Error('El aviso no existe.')
    await prisma.screenNotice.delete({ where: { id } })
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'notice.delete', entity: 'ScreenNotice', entityId: id, details: { title: n.title } })
    refresh()
    return { ok: true, message: 'Aviso eliminado' }
  } catch (error) {
    return toActionError(error)
  }
}

/** Cualquier usuario puede ocultar para sí un aviso descartable. */
export async function dismissNotice(id: string): Promise<{ ok: boolean }> {
  const user = await currentUser()
  if (!user) return { ok: false }
  const n = await prisma.screenNotice.findFirst({ where: { id, tenantId: user.tenantId, dismissible: true } })
  if (!n) return { ok: false }
  await prisma.noticeDismissal.upsert({
    where: { noticeId_userId: { noticeId: id, userId: user.id } },
    update: {},
    create: { noticeId: id, userId: user.id },
  })
  refresh()
  return { ok: true }
}
