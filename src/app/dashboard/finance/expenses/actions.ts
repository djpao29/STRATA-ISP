'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireActionUser } from '@/lib/session'
import { audit } from '@/lib/audit'
import { formToObject, money, toActionError, type ActionState } from '@/lib/actions'
import { dateInput } from '@/lib/payments'
import { readReceipt } from '@/lib/uploads'

export async function createExpense(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('expenses')
    const data = z
      .object({
        date: dateInput,
        categoryId: z.string({ required_error: 'Elige la categoría' }),
        description: z.string({ required_error: 'Obligatorio' }).max(300),
        supplier: z.string().max(150).optional(),
        reference: z.string().max(100).optional(),
        amount: money,
        accountId: z.string().optional(),
      })
      .parse(formToObject(formData))
    const category = await prisma.expenseCategory.findFirst({ where: { id: data.categoryId, tenantId: user.tenantId, isActive: true } })
    if (!category) throw new Error('La categoría no existe o está desactivada.')
    if (data.accountId) {
      const a = await prisma.paymentAccount.findFirst({ where: { id: data.accountId, tenantId: user.tenantId } })
      if (!a) throw new Error('La forma de pago no existe.')
    }
    const receipt = await readReceipt(formData.get('receipt'))
    const expense = await prisma.expense.create({
      data: {
        ...data,
        receiptData: receipt?.data,
        receiptMime: receipt?.mime,
        receiptName: receipt?.name,
        createdById: user.id,
        tenantId: user.tenantId,
      },
    })
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'expense.create', entity: 'Expense', entityId: expense.id, details: { amount: data.amount, category: category.name } })
    revalidatePath('/dashboard/finance/expenses')
    revalidatePath('/dashboard/finance/accounting')
    return { ok: true, message: 'Gasto registrado' }
  } catch (error) {
    return toActionError(error)
  }
}

export async function deleteExpense(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('expenses')
    const id = z.string().parse(formData.get('id'))
    const e = await prisma.expense.findFirst({ where: { id, tenantId: user.tenantId } })
    if (!e) throw new Error('El gasto no existe.')
    await prisma.expense.delete({ where: { id } })
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'expense.delete', entity: 'Expense', entityId: id, details: { amount: e.amount.toFixed(2), description: e.description } })
    revalidatePath('/dashboard/finance/expenses')
    return { ok: true, message: 'Gasto eliminado' }
  } catch (error) {
    return toActionError(error)
  }
}

// ── Categorías ──

export async function createCategory(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('expenses')
    const name = z.string({ required_error: 'Obligatorio' }).max(60).parse(formToObject(formData).name)
    await prisma.expenseCategory.create({ data: { name, tenantId: user.tenantId } })
    revalidatePath('/dashboard/finance/expense-categories')
    return { ok: true, message: 'Categoría creada' }
  } catch (error) {
    return toActionError(error)
  }
}

export async function toggleCategory(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('expenses')
    const id = z.string().parse(formData.get('id'))
    const c = await prisma.expenseCategory.findFirst({ where: { id, tenantId: user.tenantId } })
    if (!c) throw new Error('La categoría no existe.')
    await prisma.expenseCategory.update({ where: { id }, data: { isActive: !c.isActive } })
    revalidatePath('/dashboard/finance/expense-categories')
    return { ok: true, message: c.isActive ? 'Categoría desactivada' : 'Categoría activada' }
  } catch (error) {
    return toActionError(error)
  }
}

export async function deleteCategory(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('expenses')
    const id = z.string().parse(formData.get('id'))
    const c = await prisma.expenseCategory.findFirst({ where: { id, tenantId: user.tenantId }, include: { _count: { select: { expenses: true } } } })
    if (!c) throw new Error('La categoría no existe.')
    if (c._count.expenses > 0) throw new Error('Tiene gastos registrados. Desactívala en lugar de eliminarla.')
    await prisma.expenseCategory.delete({ where: { id } })
    revalidatePath('/dashboard/finance/expense-categories')
    return { ok: true, message: 'Categoría eliminada' }
  } catch (error) {
    return toActionError(error)
  }
}
