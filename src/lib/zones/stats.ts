import type { Zone } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { localNow as localNowIn } from '@/lib/dates'
import { cycleInfo, lastCycleStart, nextCycleStart, nextSuspendDate } from './cycle'

export type ZoneStats = Awaited<ReturnType<typeof zoneStats>>

/** Indicadores de una zona calculados en la base de datos (sin datos ficticios). */
export async function zoneStats(zone: Zone, timeZone: string) {
  const local = localNowIn(timeZone)
  const current = cycleInfo(zone, lastCycleStart(zone, local))
  const base = { zoneId: zone.id, status: { not: 'CANCELLED' as const } }

  const [customers, pending, suspended, generated, paid, overdue, pendingCuts] = await Promise.all([
    prisma.customer.count({ where: base }),
    prisma.customer.count({ where: { ...base, invoices: { some: { status: { in: ['PENDING', 'OVERDUE'] } } } } }),
    prisma.customer.count({ where: { zoneId: zone.id, status: 'SUSPENDED' } }),
    prisma.invoice.count({ where: { zoneId: zone.id, periodStart: current.cycleDate, status: { not: 'CANCELLED' } } }),
    prisma.invoice.count({ where: { zoneId: zone.id, periodStart: current.cycleDate, status: 'PAID' } }),
    prisma.invoice.count({ where: { zoneId: zone.id, status: 'OVERDUE' } }),
    prisma.networkAction.count({ where: { customer: { zoneId: zone.id }, status: { in: ['PENDING', 'FAILED'] } } }),
  ])

  return {
    customers,
    upToDate: customers - pending,
    pending,
    suspended,
    currentCycle: current,
    invoicesGenerated: generated,
    invoicesPaid: paid,
    invoicesOverdue: overdue,
    pendingCuts,
    nextInvoiceDate: nextCycleStart(zone, local),
    nextSuspendDate: nextSuspendDate(zone, local),
  }
}
