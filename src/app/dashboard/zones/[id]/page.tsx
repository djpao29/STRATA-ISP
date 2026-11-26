import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowDown, ArrowUp, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/app/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { param } from '@/components/app/list-controls'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { can } from '@/lib/permissions'
import { formatCurrency, formatDate, toNumber } from '@/lib/format'
import { localNow as localNowIn } from '@/lib/dates'
import { cycleInfo, lastCycleStart, nextCycleStart } from '@/lib/zones/cycle'
import { formatCustomerCode } from '@/lib/zones/billing'
import { cn } from '@/lib/utils'

type Props = { params: { id: string }; searchParams: Record<string, string | string[] | undefined> }

type Row = {
  id: string
  code: number | null
  name: string
  phone: string
  plans: string
  price: number
  payment: 'AL_DIA' | 'PENDIENTE' | 'VENCIDA'
  service: 'ACTIVO' | 'SUSPENDIDO' | 'CORTE_PENDIENTE' | 'PENDIENTE_INSTALACION'
  billingDate: Date
  dueDate: Date
  nextInvoice: Date
  cutDate: Date | null
}

const PAYMENT_LABEL = { AL_DIA: 'Al día', PENDIENTE: 'Pendiente', VENCIDA: 'Vencida' }
const PAYMENT_COLOR = { AL_DIA: 'bg-green-100 text-green-800', PENDIENTE: 'bg-yellow-100 text-yellow-800', VENCIDA: 'bg-red-100 text-red-800' }
const SERVICE_LABEL = { ACTIVO: 'Activo', SUSPENDIDO: 'Suspendido', CORTE_PENDIENTE: 'Corte/reconexión pendiente', PENDIENTE_INSTALACION: 'Por instalar' }
const SERVICE_COLOR = {
  ACTIVO: 'bg-green-100 text-green-800',
  SUSPENDIDO: 'bg-red-100 text-red-800',
  CORTE_PENDIENTE: 'bg-amber-100 text-amber-800',
  PENDIENTE_INSTALACION: 'bg-gray-100 text-gray-700',
}

const SORTS: Record<string, (a: Row, b: Row) => number> = {
  code: (a, b) => (a.code ?? 0) - (b.code ?? 0),
  name: (a, b) => a.name.localeCompare(b.name, 'es'),
  price: (a, b) => a.price - b.price,
  payment: (a, b) => a.payment.localeCompare(b.payment),
  service: (a, b) => a.service.localeCompare(b.service),
  cut: (a, b) => (a.cutDate?.getTime() ?? Infinity) - (b.cutDate?.getTime() ?? Infinity),
}

export default async function ZoneDetailPage({ params, searchParams }: Props) {
  const user = await requireUser('zones')
  const zone = await prisma.zone.findFirst({ where: { id: params.id, tenantId: user.tenantId } })
  if (!zone) notFound()

  const q = param(searchParams.q)?.toLowerCase()
  const payment = param(searchParams.payment)
  const service = param(searchParams.service)
  const sort = SORTS[param(searchParams.sort) ?? ''] ? param(searchParams.sort)! : 'name'
  const dir = param(searchParams.dir) === 'desc' ? 'desc' : 'asc'

  const local = localNowIn(user.tenant.timezone)
  const current = cycleInfo(zone, lastCycleStart(zone, local))
  const next = nextCycleStart(zone, local)

  const customers = await prisma.customer.findMany({
    where: { zoneId: zone.id, status: { not: 'CANCELLED' } },
    include: {
      services: { where: { isActive: true }, include: { plan: { select: { name: true, price: true } } } },
      invoices: { where: { status: { in: ['PENDING', 'OVERDUE'] } }, orderBy: { dueDate: 'asc' }, select: { status: true, suspendDate: true } },
      networkActions: { where: { status: { in: ['PENDING', 'RUNNING'] } }, select: { id: true } },
    },
  })

  let rows: Row[] = customers.map((c) => {
    const overdue = c.invoices.some((i) => i.status === 'OVERDUE')
    const firstCut = c.invoices.find((i) => i.suspendDate)?.suspendDate ?? null
    return {
      id: c.id,
      code: c.code,
      name: `${c.firstName} ${c.lastName}`,
      phone: c.phone,
      plans: c.services.map((s) => s.plan.name).join(', ') || '—',
      price: c.services.reduce((sum, s) => sum + toNumber(s.plan.price), 0),
      payment: c.invoices.length === 0 ? 'AL_DIA' : overdue ? 'VENCIDA' : 'PENDIENTE',
      service:
        c.networkActions.length > 0
          ? 'CORTE_PENDIENTE'
          : c.status === 'SUSPENDED'
            ? 'SUSPENDIDO'
            : c.status === 'PENDING'
              ? 'PENDIENTE_INSTALACION'
              : 'ACTIVO',
      billingDate: current.cycleDate,
      dueDate: current.dueDate,
      nextInvoice: next,
      // Fecha de corte de la factura impaga más antigua; si no debe nada, la del ciclo vigente.
      cutDate: firstCut ?? (current.suspendDate > local ? current.suspendDate : null),
    }
  })

  if (q) rows = rows.filter((r) => [r.name, r.phone, formatCustomerCode(r.code), r.plans].some((v) => v.toLowerCase().includes(q)))
  if (payment) rows = rows.filter((r) => r.payment === payment)
  if (service) rows = rows.filter((r) => r.service === service)
  rows.sort(SORTS[sort])
  if (dir === 'desc') rows.reverse()

  const total = customers.length
  const qs = (patch: Record<string, string | undefined>) => {
    const sp = new URLSearchParams()
    Object.entries({ q: param(searchParams.q), payment, service, sort, dir, ...patch }).forEach(([k, v]) => v && sp.set(k, v))
    return `/dashboard/zones/${zone.id}?${sp.toString()}`
  }
  const sortLink = (key: string, label: string) => (
    <Link href={qs({ sort: key, dir: sort === key && dir === 'asc' ? 'desc' : 'asc' })} className="inline-flex items-center gap-1 hover:text-gray-900">
      {label}
      {sort === key && (dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
    </Link>
  )
  const currency = user.tenant.currency

  return (
    <div className="space-y-6">
      <PageHeader
        title={zone.name}
        description={`Factura el ${zone.invoiceDay} · paga hasta el ${zone.dueDay} · corte el ${zone.suspendDay}${zone.suspendDay < zone.dueDay ? ' del mes siguiente' : ''} · ciclo actual ${formatDate(current.cycleDate)} (corte ${formatDate(current.suspendDate)}) · próxima factura ${formatDate(next)}`}
      >
        {can(user.role, 'zonesWrite') && (
          <Button asChild variant="outline">
            <Link href={`/dashboard/zones/${zone.id}/edit`}>
              <Settings2 className="mr-2 h-4 w-4" />
              Configurar
            </Link>
          </Button>
        )}
      </PageHeader>

      <form className="flex flex-col gap-2 sm:flex-row" role="search">
        <input type="hidden" name="sort" value={sort} />
        <input type="hidden" name="dir" value={dir} />
        <input
          name="q"
          defaultValue={param(searchParams.q)}
          placeholder="Buscar por código, nombre, teléfono o plan"
          className="flex h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <select name="payment" defaultValue={payment ?? ''} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
          <option value="">Todo estado de pago</option>
          <option value="AL_DIA">Al día</option>
          <option value="PENDIENTE">Pendiente</option>
          <option value="VENCIDA">Vencida</option>
        </select>
        <select name="service" defaultValue={service ?? ''} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
          <option value="">Todo estado de servicio</option>
          <option value="ACTIVO">Activo</option>
          <option value="SUSPENDIDO">Suspendido</option>
          <option value="CORTE_PENDIENTE">Corte/reconexión pendiente</option>
          <option value="PENDIENTE_INSTALACION">Por instalar</option>
        </select>
        <Button type="submit" variant="secondary">Filtrar</Button>
      </form>

      <p className="text-xs text-muted-foreground">
        {rows.length} de {total} clientes
      </p>

      <Card>
        <CardContent className="pt-6">
          {rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {total === 0 ? 'Esta zona no tiene clientes. Asigna la zona desde la ficha de cada cliente.' : 'Ningún cliente coincide con el filtro.'}
            </p>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>{sortLink('code', 'Código')}</th>
                    <th>{sortLink('name', 'Nombre')}</th>
                    <th>Teléfono</th>
                    <th>Plan</th>
                    <th>{sortLink('price', 'Precio')}</th>
                    <th>Facturación</th>
                    <th>Límite de pago</th>
                    <th>{sortLink('payment', 'Pago')}</th>
                    <th>{sortLink('service', 'Servicio')}</th>
                    <th>Próxima factura</th>
                    <th>{sortLink('cut', 'Corte')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="font-mono text-xs">{formatCustomerCode(r.code)}</td>
                      <td>
                        <Link href={`/dashboard/customers/${r.id}`} className="font-medium text-blue-700 hover:underline">{r.name}</Link>
                      </td>
                      <td>{r.phone}</td>
                      <td>{r.plans}</td>
                      <td>{formatCurrency(r.price, currency)}</td>
                      <td>{formatDate(r.billingDate)}</td>
                      <td>{formatDate(r.dueDate)}</td>
                      <td><span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', PAYMENT_COLOR[r.payment])}>{PAYMENT_LABEL[r.payment]}</span></td>
                      <td><span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', SERVICE_COLOR[r.service])}>{SERVICE_LABEL[r.service]}</span></td>
                      <td>{formatDate(r.nextInvoice)}</td>
                      <td className={r.payment === 'VENCIDA' ? 'font-semibold text-red-600' : ''}>{r.cutDate ? formatDate(r.cutDate) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
