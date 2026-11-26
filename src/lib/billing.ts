import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { addDays, formatInvoiceNumber, invoiceStatusAfterPayments, periodLabel } from '@/lib/billing-rules'
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

/**
 * Genera la factura del periodo para cada servicio activo de clientes activos.
 * Si un servicio ya tiene factura de ese periodo, se salta (restricción única en la base).
 */
export async function generateMonthlyInvoices(tenantId: string, periodStart: Date) {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { dueDays: true, timezone: true } })
  const services = await prisma.service.findMany({
    where: { tenantId, isActive: true, customer: { status: 'ACTIVE' } },
    include: { plan: true },
  })

  const already = new Set(
    (
      await prisma.invoice.findMany({
        where: { tenantId, periodStart, serviceId: { in: services.map((s) => s.id) } },
        select: { serviceId: true },
      })
    ).map((i) => i.serviceId)
  )

  const issueDate = todayIn(tenant.timezone)
  let created = 0
  for (const service of services) {
    if (already.has(service.id)) continue
    try {
      await prisma.$transaction(async (tx) => {
        await tx.invoice.create({
          data: {
            number: await nextInvoiceNumber(tx, tenantId),
            description: `Servicio de internet ${service.plan.name} - ${periodLabel(periodStart)}`,
            amount: service.plan.price,
            periodStart,
            issueDate,
            dueDate: addDays(issueDate, tenant.dueDays),
            customerId: service.customerId,
            serviceId: service.id,
            tenantId,
          },
        })
      })
      created++
    } catch (error) {
      // Otra generación simultánea pudo crear la misma factura: se ignora el duplicado.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error
    }
  }
  return { created, skipped: services.length - created, services: services.length }
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
