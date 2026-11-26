'use server'

import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireActionUser } from '@/lib/session'
import { audit } from '@/lib/audit'
import { formToObject, toActionError, type ActionState } from '@/lib/actions'
import { passwordRule } from '@/lib/validation'

export async function changeOwnPassword(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('dashboard')
    const data = z
      .object({
        current: z.string({ required_error: 'Obligatorio' }),
        password: passwordRule,
        confirm: z.string({ required_error: 'Obligatorio' }),
      })
      .refine((d) => d.password === d.confirm, { path: ['confirm'], message: 'No coincide con la nueva contraseña' })
      .parse(formToObject(formData))

    const record = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    if (!(await bcrypt.compare(data.current, record.password))) {
      return { error: 'Revisa los campos marcados.', fieldErrors: { current: ['La contraseña actual no es correcta'] } }
    }
    await prisma.user.update({ where: { id: user.id }, data: { password: await bcrypt.hash(data.password, 12) } })
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'user.password_change', entity: 'User', entityId: user.id })
    return { ok: true, message: 'Contraseña actualizada' }
  } catch (error) {
    return toActionError(error)
  }
}
