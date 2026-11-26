'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireActionUser } from '@/lib/session'
import { audit } from '@/lib/audit'
import { formToObject, money, toActionError, type ActionState } from '@/lib/actions'
import { nextInvoiceNumber, paidAmount, refreshInvoiceStatus } from '@/lib/billing'
import { runZoneBilling } from '@/lib/zones/billing'
import { processSoon, reconcileCustomer } from '@/lib/zones/network'

const dateInput = z
  .string({ required_error: 'Obligatorio' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida')
  .transform((v) => new Date(`${v}T00:00:00.000Z`))

const invoiceSchema = z.object({
  customerId: z.string({ required_error: 'Elige un cliente' }),
  description: z.string({ required_error: 'Obligatorio' }).max(300),
  amount: money,
  dueDate: dateInput,
})

export async function createInvoice(_: ActionState, formData: FormData): Promise<ActionState> {
  let id: string
  try {
    const user = await requireActionUser('billing')
    const data = invoiceSchema.parse(formToObject(formData))
    const customer = await prisma.customer.findFirst({ where: { id: data.customerId, tenantId: user.tenantId } })
    if (!customer) throw new Error('El cliente no existe.')

    const invoice = await prisma.$transaction(async (tx) =>
      tx.invoice.create({
        data: { ...data, number: await nextInvoiceNumber(tx, user.tenantId), tenantId: user.tenantId },
      })
    )
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'invoice.create', entity: 'Invoice', entityId: invoice.id, details: { number: invoice.number } })
    id = invoice.id
  } catch (error) {
    return toActionError(error)
  }
  revalidatePath('/dashboard/billing')
  redirect(`/dashboard/billing/${id}`)
}

/** Ejecuta ahora la facturación del ciclo vigente de cada zona activa (incluye zonas con facturación manual). */
export async function generateInvoices(_: ActionState): Promise<ActionState> {
  try {
    const user = await requireActionUser('billing')
    const results = await runZoneBilling(user.tenantId, { includeManual: true })
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'invoice.generate', entity: 'Invoice', details: { results } })
    revalidatePath('/dashboard/billing')
    revalidatePath('/dashboard/zones')
    if (results.length === 0) return { ok: true, message: 'No hay zonas activas.' }
    return {
      ok: true,
      message: results.map((r) => `${r.zone} (ciclo ${r.cycle}): ${r.created} nuevas, ${r.skipped} ya facturadas`).join(' · '),
    }
  } catch (error) {
    return toActionError(error)
  }
}

export async function cancelInvoice(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('billing')
    const id = z.string().parse(formData.get('id'))
    const invoice = await prisma.invoice.findFirst({ where: { id, tenantId: user.tenantId } })
    if (!invoice) throw new Error('La factura no existe.')
    if (invoice.status === 'CANCELLED') throw new Error('La factura ya está anulada.')
    if ((await paidAmount(id)) > 0) throw new Error('La factura tiene pagos aprobados. Rechaza o revisa los pagos antes de anularla.')
    await prisma.invoice.update({ where: { id }, data: { status: 'CANCELLED' } })
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'invoice.cancel', entity: 'Invoice', entityId: id })
    revalidatePath(`/dashboard/billing/${id}`)
    revalidatePath('/dashboard/billing')
    return { ok: true, message: 'Factura anulada' }
  } catch (error) {
    return toActionError(error)
  }
}

const paymentSchema = z.object({
  amount: money,
  method: z.enum(['CASH', 'TRANSFER', 'DEPOSIT', 'CARD', 'OTHER']),
  reference: z.string().max(100).optional(),
  paidDate: dateInput,
  notes: z.string().max(500).optional(),
})

export async function registerPayment(invoiceId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('payments')
    const data = paymentSchema.parse(formToObject(formData))
    const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, tenantId: user.tenantId } })
    if (!invoice) throw new Error('La factura no existe.')
    if (invoice.status === 'CANCELLED') throw new Error('No se pueden registrar pagos en una factura anulada.')

    const remaining = invoice.amount.toNumber() - (await paidAmount(invoiceId))
    if (data.amount - remaining > 0.004) {
      throw new Error(`El monto supera el saldo pendiente de la factura (${remaining.toFixed(2)}).`)
    }

    const payment = await prisma.$transaction(async (tx) => {
      const p = await tx.payment.create({
        data: {
          ...data,
          status: 'APPROVED',
          invoiceId,
          customerId: invoice.customerId,
          createdById: user.id,
          tenantId: user.tenantId,
        },
      })
      await refreshInvoiceStatus(tx, invoiceId)
      return p
    })
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'payment.create', entity: 'Payment', entityId: payment.id, details: { invoiceId, amount: data.amount } })
    // Reconexión automática si el pago salda la deuda que causó el corte.
    const reconnected = await reconcileCustomer(invoice.customerId)
    if (reconnected) processSoon(invoice.customerId)
    revalidatePath(`/dashboard/billing/${invoiceId}`)
    revalidatePath('/dashboard/billing')
    revalidatePath('/dashboard/payments')
    return { ok: true, message: reconnected ? 'Pago registrado · cliente reconectado' : 'Pago registrado' }
  } catch (error) {
    return toActionError(error)
  }
}
