import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { paidAmount, refreshInvoiceStatus } from '@/lib/billing'
import { audit } from '@/lib/audit'
import { money } from '@/lib/actions'
import { readReceipt } from '@/lib/uploads'
import { processSoon, reconcileCustomer } from '@/lib/zones/network'
import { resolvePromisesForCustomer } from '@/lib/promises'

export const dateInput = z
  .string({ required_error: 'Obligatorio' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida')
  .transform((v) => new Date(`${v}T00:00:00.000Z`))

export const paymentInputSchema = z.object({
  amount: money,
  accountId: z.string({ required_error: 'Elige la forma de pago' }),
  reference: z.string().max(100).optional(),
  paidDate: dateInput,
  notes: z.string().max(500).optional(),
})

/**
 * Registra un pago sobre una factura.
 * - STAFF: registrado en oficina → queda APROBADO, actualiza la factura y reconecta si corresponde.
 * - REPORT: informado por el cliente → queda PENDIENTE de revisión, con su comprobante.
 */
export async function createInvoicePayment(params: {
  user: { id: string; tenantId: string }
  invoiceId: string
  input: z.infer<typeof paymentInputSchema>
  receiptEntry: FormDataEntryValue | null
  source: 'STAFF' | 'REPORT'
}) {
  const { user, invoiceId, input, source } = params
  const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, tenantId: user.tenantId } })
  if (!invoice) throw new Error('La factura no existe.')
  if (invoice.status === 'CANCELLED') throw new Error('No se pueden registrar pagos en una factura anulada.')
  if (invoice.status === 'PAID') throw new Error('La factura ya está pagada.')

  const account = await prisma.paymentAccount.findFirst({ where: { id: input.accountId, tenantId: user.tenantId, isActive: true } })
  if (!account) throw new Error('La forma de pago elegida no existe o está desactivada.')

  const remaining = invoice.amount.toNumber() - (await paidAmount(invoiceId))
  if (input.amount - remaining > 0.004) throw new Error(`El monto supera el saldo pendiente de la factura (${remaining.toFixed(2)}).`)

  const receipt = await readReceipt(params.receiptEntry)
  if (source === 'REPORT' && !receipt && !input.reference) {
    throw new Error('Un reporte de pago necesita el comprobante o, al menos, el número de referencia.')
  }

  const payment = await prisma.$transaction(async (tx) => {
    const p = await tx.payment.create({
      data: {
        amount: input.amount,
        method: account.method,
        accountId: account.id,
        reference: input.reference,
        paidDate: input.paidDate,
        notes: input.notes,
        status: source === 'STAFF' ? 'APPROVED' : 'PENDING',
        source,
        receiptData: receipt?.data,
        receiptMime: receipt?.mime,
        receiptName: receipt?.name,
        invoiceId,
        customerId: invoice.customerId,
        createdById: user.id,
        tenantId: user.tenantId,
      },
    })
    if (source === 'STAFF') await refreshInvoiceStatus(tx, invoiceId)
    return p
  })

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: source === 'STAFF' ? 'payment.create' : 'payment.report',
    entity: 'Payment',
    entityId: payment.id,
    details: { invoiceId, amount: input.amount, account: account.name, receipt: !!receipt },
  })

  let reconnected = false
  if (source === 'STAFF') {
    await resolvePromisesForCustomer(invoice.customerId)
    reconnected = await reconcileCustomer(invoice.customerId)
    if (reconnected) processSoon(invoice.customerId)
  }
  return { payment, reconnected }
}

/** Opciones de formas de pago activas para los formularios. */
export async function accountOptions(tenantId: string) {
  const accounts = await prisma.paymentAccount.findMany({
    where: { tenantId, isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true },
  })
  return accounts.map((a) => ({ value: a.id, label: a.name }))
}
