'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireActionUser } from '@/lib/session'
import { audit } from '@/lib/audit'
import { toActionError, type ActionState } from '@/lib/actions'
import { refreshInvoiceStatus } from '@/lib/billing'
import { processSoon, reconcileCustomer } from '@/lib/zones/network'
import { resolvePromisesForCustomer } from '@/lib/promises'

/** Aprueba o rechaza un pago. Rechazar un pago aprobado lo revierte y la factura vuelve a quedar pendiente. */
export async function reviewPayment(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('payments')
    const { id, decision } = z
      .object({ id: z.string(), decision: z.enum(['APPROVED', 'REJECTED']) })
      .parse({ id: formData.get('id'), decision: formData.get('decision') })
    const rejectReason = (formData.get('reason') as string | null)?.trim().slice(0, 300) || null

    const payment = await prisma.payment.findFirst({ where: { id, tenantId: user.tenantId } })
    if (!payment) throw new Error('El pago no existe.')
    if (payment.status === decision) throw new Error('El pago ya tiene ese estado.')

    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id },
        data: { status: decision, reviewedById: user.id, reviewedAt: new Date(), rejectReason: decision === 'REJECTED' ? rejectReason : null },
      })
      if (payment.invoiceId) await refreshInvoiceStatus(tx, payment.invoiceId)
    })
    await audit({ tenantId: user.tenantId, userId: user.id, action: `payment.${decision.toLowerCase()}`, entity: 'Payment', entityId: id })

    // Al aprobar, reconectar si ya no hay deuda que justifique el corte.
    if (decision === 'APPROVED') await resolvePromisesForCustomer(payment.customerId)
    const reconnected = decision === 'APPROVED' ? await reconcileCustomer(payment.customerId) : false
    if (reconnected) processSoon(payment.customerId)
    revalidatePath('/dashboard/payments')
    revalidatePath('/dashboard/finance/payment-reports')
    revalidatePath('/dashboard/finance/receipts')
    if (payment.invoiceId) revalidatePath(`/dashboard/billing/${payment.invoiceId}`)
    revalidatePath('/dashboard/billing')
    return {
      ok: true,
      message: decision === 'APPROVED' ? (reconnected ? 'Pago aprobado · cliente reconectado' : 'Pago aprobado') : 'Pago rechazado',
    }
  } catch (error) {
    return toActionError(error)
  }
}
