import Link from 'next/link'
import type { PromiseStatus } from '@prisma/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { ActionButton } from '@/components/forms/action-form'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { formatCurrency, formatDate, formatDateTime, toDateInput, toNumber } from '@/lib/format'
import { todayIn } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { cancelPromise, createPromise } from '../actions'
import { PromiseForm } from '../forms'

export const metadata = { title: 'Promesas de pago' }

const STATUS: Record<PromiseStatus, [string, string]> = {
  ACTIVE: ['Vigente', 'bg-blue-100 text-blue-800'],
  FULFILLED: ['Cumplida', 'bg-green-100 text-green-800'],
  BROKEN: ['Incumplida', 'bg-red-100 text-red-800'],
  CANCELLED: ['Cancelada', 'bg-gray-100 text-gray-700'],
}

export default async function PromisesPage({ searchParams }: { searchParams: { status?: string } }) {
  const user = await requireUser('finance')
  const tz = user.tenant.timezone
  const today = todayIn(tz)
  const status = (Object.keys(STATUS) as PromiseStatus[]).includes(searchParams.status as PromiseStatus) ? (searchParams.status as PromiseStatus) : undefined

  const [promises, counts, debtors] = await Promise.all([
    prisma.paymentPromise.findMany({
      where: { tenantId: user.tenantId, ...(status ? { status } : {}) },
      orderBy: [{ status: 'asc' }, { promisedDate: 'asc' }],
      take: 100,
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, phone: true, status: true } },
        invoice: { select: { number: true } },
        createdBy: { select: { name: true } },
      },
    }),
    prisma.paymentPromise.groupBy({ by: ['status'], where: { tenantId: user.tenantId }, _count: true }),
    prisma.customer.findMany({
      where: { tenantId: user.tenantId, status: { not: 'CANCELLED' }, invoices: { some: { status: { in: ['PENDING', 'OVERDUE'] } } } },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      include: { invoices: { where: { status: { in: ['PENDING', 'OVERDUE'] } }, select: { amount: true } } },
    }),
  ])
  const count = (s: PromiseStatus) => counts.find((c) => c.status === s)?._count ?? 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="Promesas de pago"
        description="Mientras la promesa está vigente el cliente no se corta. Si ya estaba cortado por falta de pago, se reconecta."
      />

      <div className="flex flex-wrap gap-2 text-sm">
        <Link href="/dashboard/finance/promises" className={cn('rounded-full border px-3 py-1', !status && 'border-blue-600 bg-blue-50 text-blue-700')}>
          Todas
        </Link>
        {(Object.keys(STATUS) as PromiseStatus[]).map((s) => (
          <Link
            key={s}
            href={`/dashboard/finance/promises?status=${s}`}
            className={cn('rounded-full border px-3 py-1', status === s && 'border-blue-600 bg-blue-50 text-blue-700')}
          >
            {STATUS[s][0]} ({count(s)})
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nueva promesa</CardTitle>
        </CardHeader>
        <CardContent>
          {debtors.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ningún cliente tiene facturas pendientes.</p>
          ) : (
            <PromiseForm
              action={createPromise}
              today={toDateInput(today)}
              customers={debtors.map((c) => ({
                value: c.id,
                label: `${c.lastName} ${c.firstName} · debe ${formatCurrency(
                  c.invoices.reduce((s, i) => s + toNumber(i.amount), 0),
                  user.tenant.currency
                )}${c.status === 'SUSPENDED' ? ' · CORTADO' : ''}`,
              }))}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {promises.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin promesas{status ? ' en este estado' : ''}.</p>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Pagará hasta</th>
                    <th>Monto</th>
                    <th>Factura</th>
                    <th>Estado</th>
                    <th>Registrada</th>
                    <th>Notas</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {promises.map((p) => {
                    const overdue = p.status === 'ACTIVE' && p.promisedDate < today
                    return (
                      <tr key={p.id}>
                        <td>
                          <Link href={`/dashboard/customers/${p.customer.id}`} className="font-medium text-blue-700 hover:underline">
                            {p.customer.firstName} {p.customer.lastName}
                          </Link>
                          <div className="text-xs text-muted-foreground">{p.customer.phone}</div>
                        </td>
                        <td className={overdue ? 'font-semibold text-red-600' : ''}>{formatDate(p.promisedDate)}</td>
                        <td>{p.amount ? formatCurrency(p.amount, user.tenant.currency) : '—'}</td>
                        <td>{p.invoice?.number ?? '—'}</td>
                        <td>
                          <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', STATUS[p.status][1])}>{STATUS[p.status][0]}</span>
                        </td>
                        <td className="text-xs">
                          {formatDateTime(p.createdAt, tz)}
                          <div className="text-muted-foreground">{p.createdBy?.name ?? '—'}</div>
                        </td>
                        <td className="max-w-xs whitespace-normal text-xs">{p.notes ?? '—'}</td>
                        <td className="text-right">
                          {p.status === 'ACTIVE' && (
                            <ActionButton action={cancelPromise} fields={{ id: p.id }} variant="ghost" size="sm" className="text-red-600" confirm="¿Cancelar la promesa? El cliente vuelve a la regla normal de cortes.">
                              Cancelar
                            </ActionButton>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
