import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { formatInvoiceNumber, invoiceStatusAfterPayments } from '@/lib/billing-rules'
import { todayIn } from '@/lib/dates'

async function tenantToday(tx: Tx | typeof prisma, tenantId: string) {
  const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { timezone: true } })
  return todayIn(tenant.timezone)
}

type Tx = Prisma.TransactionClient

/** Reserva el siguiente número de factura del tenant de forma atómica. */
export async function nextInvoiceNumber(tx: Tx, tenantId: string) {
  const tenant = await tx.tenant.update({
    where: { id: tenantId },
    data: { nextInvoiceNumber: { increment: 1 } },
    select: { invoicePrefix: true, nextInvoiceNumber: true },
  })
  return formatInvoiceNumber(tenant.invoicePrefix, tenant.nextInvoiceNumber - 1)
}

/** Pasa a OVERDUE las facturas pendientes cuya fecha de vencimiento ya pasó. */
export async function markOverdueInvoices(tenantId: string) {
  await prisma.invoice.updateMany({
    where: { tenantId, status: 'PENDING', dueDate: { lt: await tenantToday(prisma, tenantId) } },
    data: { status: 'OVERDUE' },
  })
}

/** Recalcula el estado de una factura según sus pagos aprobados. */
export async function refreshInvoiceStatus(tx: Tx, invoiceId: string) {
  const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } })
  if (invoice.status === 'CANCELLED') return invoice
  const paid = await tx.payment.aggregate({
    where: { invoiceId, status: 'APPROVED' },
    _sum: { amount: true },
    _max: { paidDate: true },
  })
  const status = invoiceStatusAfterPayments({
    amount: invoice.amount.toNumber(),
    approvedPaid: paid._sum.amount?.toNumber() ?? 0,
    dueDate: invoice.dueDate,
    now: await tenantToday(tx, invoice.tenantId),
  })
  return tx.invoice.update({
    where: { id: invoiceId },
    data: { status, paidDate: status === 'PAID' ? paid._max.paidDate ?? new Date() : null },
  })
}

/** Total aprobado pagado de una factura. */
export async function paidAmount(invoiceId: string) {
  const agg = await prisma.payment.aggregate({ where: { invoiceId, status: 'APPROVED' }, _sum: { amount: true } })
  return agg._sum.amount?.toNumber() ?? 0
}
