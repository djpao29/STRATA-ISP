import Link from 'next/link'
import { PageHeader } from '@/components/app/page-header'
import { Button } from '@/components/ui/button'
import { CustomerMap, Legend, type MapPoint } from '@/components/maps/customer-map'
import { parseCoordinates } from '@/lib/geo'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { formatCurrency, formatDate, toNumber } from '@/lib/format'
import { todayIn } from '@/lib/dates'
import { markOverdueInvoices } from '@/lib/billing'

export const metadata = { title: 'Mapa de cobro' }

const PAY = {
  AL_DIA: { color: '#16a34a', label: 'Al día' },
  PENDIENTE: { color: '#f59e0b', label: 'Pendiente (por vencer)' },
  VENCIDA: { color: '#dc2626', label: 'Vencida' },
  CORTADO: { color: '#111827', label: 'Cortado' },
} as const
type PayState = keyof typeof PAY

export default async function CollectionMapPage({ searchParams }: { searchParams: { zone?: string; only?: string } }) {
  const user = await requireUser('finance')
  await markOverdueInvoices(user.tenantId)
  const onlyDebt = searchParams.only !== 'all'
  const today = todayIn(user.tenant.timezone)

  const [customers, zones] = await Promise.all([
    prisma.customer.findMany({
      where: {
        tenantId: user.tenantId,
        status: { not: 'CANCELLED' },
        ...(searchParams.zone ? { zoneId: searchParams.zone } : {}),
        ...(onlyDebt ? { invoices: { some: { status: { in: ['PENDING', 'OVERDUE'] } } } } : {}),
      },
      include: {
        zone: { select: { name: true } },
        invoices: {
          where: { status: { in: ['PENDING', 'OVERDUE'] } },
          orderBy: { dueDate: 'asc' },
          include: { payments: { where: { status: 'APPROVED' }, select: { amount: true } } },
        },
        paymentPromises: { where: { status: 'ACTIVE' }, take: 1 },
      },
    }),
    prisma.zone.findMany({ where: { tenantId: user.tenantId }, orderBy: { invoiceDay: 'asc' }, select: { id: true, name: true } }),
  ])

  const points: Array<MapPoint & { state: PayState; balance: number }> = []
  let missing = 0
  for (const c of customers) {
    const balance = c.invoices.reduce((s, i) => s + toNumber(i.amount) - i.payments.reduce((p, x) => p + toNumber(x.amount), 0), 0)
    const state: PayState =
      c.status === 'SUSPENDED' ? 'CORTADO' : c.invoices.length === 0 ? 'AL_DIA' : c.invoices.some((i) => i.status === 'OVERDUE') ? 'VENCIDA' : 'PENDIENTE'
    const ll = parseCoordinates(c.coordinates)
    if (!ll) {
      missing++
      continue
    }
    const oldest = c.invoices[0]
    const daysLate = oldest ? Math.max(0, Math.floor((today.getTime() - oldest.dueDate.getTime()) / 86_400_000)) : 0
    points.push({
      id: c.id,
      name: `${c.firstName} ${c.lastName}`,
      lat: ll[0],
      lng: ll[1],
      color: PAY[state].color,
      state,
      balance,
      href: `/dashboard/customers/${c.id}`,
      actionHref: oldest ? `/dashboard/billing/${oldest.id}` : undefined,
      actionLabel: 'Cobrar',
      lines: [
        balance > 0 ? `Debe ${formatCurrency(balance, user.tenant.currency)} (${c.invoices.length} factura/s)` : 'Al día',
        oldest ? `Vence ${formatDate(oldest.dueDate)}${daysLate ? ` · ${daysLate} día(s) de atraso` : ''}` : '',
        c.paymentPromises[0] ? `Promesa hasta ${formatDate(c.paymentPromises[0].promisedDate)}` : '',
        [c.zone?.name, c.address, c.neighborhood].filter(Boolean).join(' · '),
        c.phone,
      ].filter(Boolean),
    })
  }
  const totalDebt = points.reduce((s, p) => s + p.balance, 0)

  return (
    <div className="space-y-4">
      <PageHeader title="Mapa de cobro" description="Clientes por estado de pago, para planificar la ruta de cobranza" />
      <form className="flex flex-col gap-2 sm:flex-row">
        <select name="zone" defaultValue={searchParams.zone ?? ''} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
          <option value="">Todas las zonas</option>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>{z.name}</option>
          ))}
        </select>
        <select name="only" defaultValue={onlyDebt ? 'debt' : 'all'} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
          <option value="debt">Solo clientes con deuda</option>
          <option value="all">Todos los clientes</option>
        </select>
        <Button type="submit" variant="secondary">Filtrar</Button>
      </form>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Legend items={(Object.keys(PAY) as PayState[]).map((s) => ({ color: PAY[s].color, label: PAY[s].label, count: points.filter((p) => p.state === s).length }))} />
        <span className="text-sm">
          Por cobrar en el mapa: <strong>{formatCurrency(totalDebt, user.tenant.currency)}</strong>
        </span>
      </div>
      <CustomerMap points={points} />
      {missing > 0 && (
        <p className="text-sm text-amber-800">
          {missing} cliente(s) sin coordenadas no aparecen en el mapa.{' '}
          <Link href="/dashboard/finance/pending" className="underline">Ver la lista de pagos pendientes</Link>
        </p>
      )}
    </div>
  )
}
