'use server'

import { revalidatePath } from 'next/cache'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireActionUser } from '@/lib/session'
import { audit } from '@/lib/audit'
import { formToObject, toActionError, type ActionState } from '@/lib/actions'
import { passwordRule } from '@/lib/validation'

export async function updateCompany(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('settings')
    const data = z
      .object({
        name: z.string({ required_error: 'Obligatorio' }).max(150),
        taxId: z.string().max(20).optional(),
        address: z.string().max(300).optional(),
        phone: z.string().max(30).optional(),
        email: z.string().email('Correo inválido').optional(),
        currency: z.string().regex(/^[A-Z]{3}$/, 'Código ISO de 3 letras (USD)'),
        timezone: z
          .string({ required_error: 'Obligatorio' })
          .max(60)
          .refine((tz) => {
            try {
              new Intl.DateTimeFormat('en', { timeZone: tz })
              return true
            } catch {
              return false
            }
          }, 'Zona horaria inválida. Ejemplos: America/Santo_Domingo, America/Guayaquil, America/Bogota'),
        invoicePrefix: z.string().regex(/^[A-Z0-9-]{1,10}$/, 'Mayúsculas, números o guion (máx. 10)'),
        dueDays: z.coerce.number().int().min(0).max(90),
      })
      .parse(formToObject(formData))
    await prisma.tenant.update({
      where: { id: user.tenantId },
      data: {
        ...data,
        taxId: data.taxId ?? null,
        address: data.address ?? null,
        phone: data.phone ?? null,
        email: data.email ?? null,
      },
    })
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'tenant.update', entity: 'Tenant', entityId: user.tenantId })
    revalidatePath('/dashboard', 'layout')
    return { ok: true, message: 'Datos de la empresa guardados' }
  } catch (error) {
    return toActionError(error)
  }
}

export async function createUser(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const admin = await requireActionUser('settings')
    const data = z
      .object({
        name: z.string({ required_error: 'Obligatorio' }).max(100),
        email: z.string({ required_error: 'Obligatorio' }).email('Correo inválido').transform((v) => v.toLowerCase()),
        role: z.enum(['ADMIN', 'MANAGER', 'TECHNICIAN', 'BILLING']),
        password: passwordRule,
      })
      .parse(formToObject(formData))
    const created = await prisma.user.create({
      data: { ...data, password: await bcrypt.hash(data.password, 12), tenantId: admin.tenantId },
    })
    await audit({ tenantId: admin.tenantId, userId: admin.id, action: 'user.create', entity: 'User', entityId: created.id, details: { email: data.email, role: data.role } })
    revalidatePath('/dashboard/settings')
    return { ok: true, message: `Usuario ${data.email} creado` }
  } catch (error) {
    return toActionError(error)
  }
}

export async function updateUserAccess(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const admin = await requireActionUser('settings')
    const data = z
      .object({
        id: z.string(),
        role: z.enum(['ADMIN', 'MANAGER', 'TECHNICIAN', 'BILLING']).optional(),
        isActive: z.enum(['true', 'false']).optional(),
      })
      .parse(formToObject(formData))
    const target = await prisma.user.findFirst({ where: { id: data.id, tenantId: admin.tenantId } })
    if (!target) throw new Error('El usuario no existe.')
    if (target.id === admin.id) throw new Error('No puedes cambiar tu propio rol ni desactivarte.')

    const isActive = data.isActive === undefined ? undefined : data.isActive === 'true'
    // Siempre debe quedar al menos un administrador activo.
    if (target.role === 'ADMIN' && (isActive === false || (data.role && data.role !== 'ADMIN'))) {
      const admins = await prisma.user.count({ where: { tenantId: admin.tenantId, role: 'ADMIN', isActive: true } })
      if (admins <= 1) throw new Error('Debe quedar al menos un administrador activo.')
    }

    await prisma.user.update({ where: { id: target.id }, data: { role: data.role, isActive } })
    await audit({ tenantId: admin.tenantId, userId: admin.id, action: 'user.access', entity: 'User', entityId: target.id, details: { role: data.role, isActive } })
    revalidatePath('/dashboard/settings')
    return { ok: true, message: 'Usuario actualizado' }
  } catch (error) {
    return toActionError(error)
  }
}

export async function resetUserPassword(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const admin = await requireActionUser('settings')
    const data = z.object({ id: z.string(), password: passwordRule }).parse(formToObject(formData))
    const target = await prisma.user.findFirst({ where: { id: data.id, tenantId: admin.tenantId } })
    if (!target) throw new Error('El usuario no existe.')
    await prisma.user.update({ where: { id: target.id }, data: { password: await bcrypt.hash(data.password, 12) } })
    await audit({ tenantId: admin.tenantId, userId: admin.id, action: 'user.password_reset', entity: 'User', entityId: target.id })
    return { ok: true, message: `Contraseña de ${target.email} cambiada` }
  } catch (error) {
    return toActionError(error)
  }
}
