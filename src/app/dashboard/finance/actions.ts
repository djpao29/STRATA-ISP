'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireActionUser } from '@/lib/session'
import { audit } from '@/lib/audit'
import { formToObject, toActionError, type ActionState } from '@/lib/actions'
import { createInvoicePayment, dateInput, paymentInputSchema } from '@/lib/payments'
import { todayIn } from '@/lib/dates'
import { validatePromiseDate } from '@/lib/promises'
import { processSoon, reconcileCustomer } from '@/lib/zones/network'

/** Reporte de pago informado por el cliente: queda pendiente de revisión con su comprobante. */
export async function submitPaymentReport(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('payments')
    const obj = formToObject(formData)
    const invoiceId = z.string({ required_error: 'Elige la factura' }).parse(obj.invoiceId)
    const input = paymentInputSchema.parse(obj)
    await createInvoicePayment({ user, invoiceId, input, receiptEntry: formData.get('receipt'), source: 'REPORT' })
    revalidatePath('/dashboard/finance/payment-reports')
    revalidatePath('/dashboard/finance/receipts')
    return { ok: true, message: 'Reporte registrado. Queda pendiente de revisión.' }
  } catch (error) {
    return toActionError(error)
  }
}

/** Promesa de pago: mientras esté vigente no se corta al cliente; si ya estaba cortado, se reconecta. */
export async function createPromise(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('finance')
    const data = z
      .object({
        customerId: z.string({ required_error: 'Elige el cliente' }),
        promisedDate: dateInput,
        amount: z.coerce.number().positive('Debe ser mayor que 0').max(1_000_000).optional(),
        notes: z.string().max(500).optional(),
      })
      .parse(formToObject(formData))

    const customer = await prisma.customer.findFirst({ where: { id: data.customerId, tenantId: user.tenantId } })
    if (!customer) throw new Error('El cliente no existe.')
    const error = validatePromiseDate(data.promisedDate, todayIn(user.tenant.timezone))
    if (error) return { error: 'Revisa los campos marcados.', fieldErrors: { promisedDate: [error] } }

    const oldest = await prisma.invoice.findFirst({
      where: { customerId: customer.id, status: { in: ['PENDING', 'OVERDUE'] } },
      orderBy: { dueDate: 'asc' },
    })
    if (!oldest) throw new Error('El cliente no tiene facturas pendientes: no hace falta una promesa.')
    const existing = await prisma.paymentPromise.findFirst({ where: { customerId: customer.id, status: 'ACTIVE' } })
    if (existing) throw new Error('El cliente ya tiene una promesa activa. Cancélala antes de crear otra.')

    const promise = await prisma.paymentPromise.create({
      data: {
        tenantId: user.tenantId,
        customerId: customer.id,
        invoiceId: oldest.id,
        promisedDate: data.promisedDate,
        amount: data.amount,
        notes: data.notes,
        createdById: user.id,
      },
    })
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'promise.create', entity: 'Customer', entityId: customer.id, details: { promiseId: promise.id, promisedDate: data.promisedDate.toISOString().slice(0, 10) } })

    // Si estaba cortado por falta de pago, la promesa lo reconecta.
    const reconnected = await reconcileCustomer(customer.id)
    if (reconnected) processSoon(customer.id)
    revalidatePath('/dashboard/finance/promises')
    revalidatePath(`/dashboard/customers/${customer.id}`)
    return { ok: true, message: reconnected ? 'Promesa registrada · cliente reconectado' : 'Promesa registrada' }
  } catch (error) {
    return toActionError(error)
  }
}

export async function cancelPromise(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('finance')
    const id = z.string().parse(formData.get('id'))
    const p = await prisma.paymentPromise.findFirst({ where: { id, tenantId: user.tenantId, status: 'ACTIVE' } })
    if (!p) throw new Error('La promesa no existe o ya está cerrada.')
    await prisma.paymentPromise.update({ where: { id }, data: { status: 'CANCELLED', resolvedAt: new Date() } })
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'promise.cancel', entity: 'Customer', entityId: p.customerId })
    revalidatePath('/dashboard/finance/promises')
    return { ok: true, message: 'Promesa cancelada: el cliente vuelve a la regla normal de cortes.' }
  } catch (error) {
    return toActionError(error)
  }
}
