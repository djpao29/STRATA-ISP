'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireActionUser } from '@/lib/session'
import { audit } from '@/lib/audit'
import { formToObject, toActionError, type ActionState } from '@/lib/actions'

const schema = z.object({
  name: z.string({ required_error: 'Obligatorio' }).max(80),
  method: z.enum(['CASH', 'TRANSFER', 'DEPOSIT', 'CARD', 'OTHER']),
  details: z.string().max(500).optional(),
})

export async function saveAccount(id: string | null, _: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('paymentAccounts')
    const data = schema.parse(formToObject(formData))
    if (id) {
      const r = await prisma.paymentAccount.updateMany({ where: { id, tenantId: user.tenantId }, data: { ...data, details: data.details ?? null } })
      if (r.count === 0) throw new Error('La forma de pago no existe.')
    } else {
      await prisma.paymentAccount.create({ data: { ...data, tenantId: user.tenantId } })
    }
    await audit({ tenantId: user.tenantId, userId: user.id, action: id ? 'account.update' : 'account.create', entity: 'PaymentAccount', entityId: id ?? undefined, details: data })
    revalidatePath('/dashboard/finance/accounts')
    return { ok: true, message: id ? 'Forma de pago actualizada' : 'Forma de pago creada' }
  } catch (error) {
    return toActionError(error)
  }
}

export async function toggleAccount(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('paymentAccounts')
    const id = z.string().parse(formData.get('id'))
    const a = await prisma.paymentAccount.findFirst({ where: { id, tenantId: user.tenantId } })
    if (!a) throw new Error('La forma de pago no existe.')
    if (a.isActive) {
      const others = await prisma.paymentAccount.count({ where: { tenantId: user.tenantId, isActive: true, id: { not: id } } })
      if (others === 0) throw new Error('Debe quedar al menos una forma de pago activa.')
    }
    await prisma.paymentAccount.update({ where: { id }, data: { isActive: !a.isActive } })
    revalidatePath('/dashboard/finance/accounts')
    return { ok: true, message: a.isActive ? 'Forma de pago desactivada' : 'Forma de pago activada' }
  } catch (error) {
    return toActionError(error)
  }
}

export async function deleteAccount(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('paymentAccounts')
    const id = z.string().parse(formData.get('id'))
    const a = await prisma.paymentAccount.findFirst({
      where: { id, tenantId: user.tenantId },
      include: { _count: { select: { payments: true, expenses: true } } },
    })
    if (!a) throw new Error('La forma de pago no existe.')
    if (a._count.payments + a._count.expenses > 0) throw new Error('Tiene pagos o gastos registrados. Desactívala en lugar de eliminarla.')
    await prisma.paymentAccount.delete({ where: { id } })
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'account.delete', entity: 'PaymentAccount', entityId: id })
    revalidatePath('/dashboard/finance/accounts')
    return { ok: true, message: 'Forma de pago eliminada' }
  } catch (error) {
    return toActionError(error)
  }
}
