import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ArrowLeft,
  ClipboardList,
  FileText,
  HeartHandshake,
  History,
  User,
  type LucideIcon,
  Plus,
  Settings,
  Ticket,
  Wifi,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DataTable } from '@/components/app/data-table'
import { StatusBadge } from '@/components/app/status-badge'
import { ActionButton } from '@/components/forms/action-form'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { can } from '@/lib/permissions'
import { formatCurrency, formatDate, formatDay, formatDateTime, toNumber } from '@/lib/format'
import { CLIENT_MODE, CUSTOMER_STATUS, PAYMENT_METHOD } from '@/lib/labels'
import { cn } from '@/lib/utils'
import { addService, changeZone, deleteCustomer, deleteService, setCustomerStatus, toggleService, updateCustomer } from '../actions'
import { manageAction } from '../../zones/actions'
import { CustomerForm } from '../customer-form'
import { ServiceForm } from './service-form'
import { ZoneSelectForm } from './zone-select-form'
import { localNow as localNowIn } from '@/lib/dates'
import { cycleInfo, lastCycleStart, nextCycleStart } from '@/lib/zones/cycle'
import { formatCustomerCode } from '@/lib/zones/billing'
import { getOltSettings } from '@/lib/olt/service'
import { OnuStatus, RxPower, pon, AUTH_LABEL } from '../../olt/shared'

const SECTIONS = [
  { key: 'general', label: 'Datos Generales', icon: User },
  { key: 'servicios', label: 'Servicios', icon: Wifi },
  { key: 'facturas', label: 'Facturas y pagos', icon: FileText },
  { key: 'promesas', label: 'Promesas de Pago', icon: HeartHandshake },
  { key: 'soporte', label: 'Soporte', icon: Ticket },
  { key: 'log', label: 'Log', icon: History },
  { key: 'configuracion', label: 'Configuración', icon: Settings },
] as const satisfies ReadonlyArray<{ key: string; label: string; icon: LucideIcon }>

type Section = (typeof SECTIONS)[number]['key']

export const metadata = { title: 'Detalle cliente' }

export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { alta?: string; altaError?: string; tab?: string }
}) {
  const user = await requireUser('customers')
  const customer = await prisma.customer.findFirst({
    where: { id: params.id, tenantId: user.tenantId },
    include: {
      services: { include: { plan: true, router: { select: { name: true } } }, orderBy: { createdAt: 'asc' } },
      zone: true,
    },
  })
  if (!customer) notFound()

  const section: Section = SECTIONS.some((s) => s.key === searchParams.tab) ? (searchParams.tab as Section) : 'general'
  const tz = user.tenant.timezone
  const currency = user.tenant.currency
  const canWrite = can(user.role, 'customersWrite')

  const [pendingBalance, paidHistory] = await Promise.all([
    prisma.invoice.aggregate({ where: { customerId: customer.id, status: { in: ['PENDING', 'OVERDUE'] } }, _sum: { amount: true }, _count: true }),
    prisma.invoice.findMany({
      where: { customerId: customer.id, status: 'PAID', paidDate: { not: null } },
      orderBy: { issueDate: 'desc' },
      take: 12,
      select: { dueDate: true, paidDate: true },
    }),
  ])
  const score = paymentScore(paidHistory)
  const activeServices = customer.services.filter((s) => s.isActive).length

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/customers" aria-label="Volver a clientes" className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Detalle Cliente</h1>
      </div>

      {searchParams.alta && (
        <p className={`rounded-md border px-4 py-3 text-sm ${searchParams.altaError ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-green-200 bg-green-50 text-green-900'}`}>
          Cliente creado. {searchParams.alta.slice(0, 500)}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="flex flex-col items-center gap-2 bg-gradient-to-b from-slate-50 to-white px-4 pb-4 pt-6 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-600 text-2xl font-bold text-white">
                {customer.firstName.charAt(0).toUpperCase()}
                {customer.lastName.charAt(0).toUpperCase()}
              </div>
              <h2 className="text-base font-bold uppercase leading-tight text-gray-900">
                {customer.firstName} {customer.lastName}
              </h2>
              <p className="text-xs text-gray-500">ID: {formatCustomerCode(customer.code)}</p>
              <StatusBadge value={customer.status} />
              <div className="mt-2 flex w-full items-center gap-3 rounded-lg border border-gray-100 bg-white px-3 py-2 text-left">
                <span
                  className={cn(
                    'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white',
                    score === null ? 'bg-gray-300' : score >= 80 ? 'bg-green-600' : score >= 50 ? 'bg-amber-500' : 'bg-red-600'
                  )}
                >
                  {score === null ? '—' : `${score}%`}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-gray-900">Puntualidad de pago</span>
                  <span className="block text-[11px] text-gray-500">
                    {score === null ? 'Sin facturas pagadas aún' : `${score >= 80 ? 'Buen pagador' : score >= 50 ? 'Regular' : 'Mal pagador'} · últimas ${paidHistory.length}`}
                  </span>
                </span>
              </div>
              <div className="grid w-full grid-cols-2 gap-2 text-left">
                <div className="rounded-lg border border-gray-100 px-3 py-2">
                  <span className="block text-[11px] text-gray-500">Pendiente</span>
                  <span className={cn('block text-sm font-bold', Number(pendingBalance._sum.amount ?? 0) > 0 ? 'text-red-700' : 'text-green-700')}>
                    {formatCurrency(pendingBalance._sum.amount, currency)}
                  </span>
                </div>
                <div className="rounded-lg border border-gray-100 px-3 py-2">
                  <span className="block text-[11px] text-gray-500">Servicios</span>
                  <span className="block text-sm font-bold text-gray-900">
                    {activeServices} activo(s)
                  </span>
                </div>
              </div>
            </div>
            <nav className="border-t border-gray-100 py-1" aria-label="Secciones del cliente">
              {SECTIONS.map((s) => {
                const active = s.key === section
                const Icon = s.icon
                return (
                  <Link
                    key={s.key}
                    href={`/dashboard/customers/${customer.id}${s.key === 'general' ? '' : `?tab=${s.key}`}`}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-3 border-l-4 px-4 py-2.5 text-sm transition',
                      active ? 'border-indigo-600 bg-indigo-50 font-semibold text-indigo-700' : 'border-transparent text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {s.label}
                  </Link>
                )
              })}
            </nav>
          </div>
        </aside>

        <div className="min-w-0 space-y-4">
          {section === 'general' && <GeneralSection customerId={customer.id} tenantId={user.tenantId} canWrite={canWrite} tz={tz} />}
          {section === 'servicios' && <ServicesSection customerId={customer.id} tenantId={user.tenantId} role={user.role} canWrite={canWrite} currency={currency} tz={tz} />}
          {section === 'facturas' && <InvoicesSection customerId={customer.id} canBill={can(user.role, 'billing')} currency={currency} />}
          {section === 'promesas' && <PromisesSection customerId={customer.id} canFinance={can(user.role, 'finance')} currency={currency} tz={tz} />}
          {section === 'soporte' && <SupportSection customerId={customer.id} canSupport={can(user.role, 'support')} tz={tz} />}
          {section === 'log' && <LogSection customerId={customer.id} tenantId={user.tenantId} canRetry={can(user.role, 'zonesWrite')} tz={tz} />}
          {section === 'configuracion' && <ConfigSection customerId={customer.id} tenantId={user.tenantId} canWrite={canWrite} tz={tz} />}
        </div>
      </div>
    </div>
  )
}

/** % de facturas pagadas a tiempo (pagadas hasta su fecha límite), sobre las últimas pagadas. */
function paymentScore(rows: Array<{ dueDate: Date; paidDate: Date | null }>) {
  if (rows.length === 0) return null
  const onTime = rows.filter((r) => r.paidDate && r.paidDate.getTime() <= r.dueDate.getTime() + 86_400_000 - 1).length
  return Math.round((onTime / rows.length) * 100)
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-4">
        <h2 className="text-lg font-bold text-gray-900">{title}</h2>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  )
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  )
}

// ── Datos generales ─────────────────────────────────────────

async function GeneralSection({ customerId, tenantId, canWrite, tz }: { customerId: string; tenantId: string; canWrite: boolean; tz: string }) {
  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } })
  if (canWrite) {
    const zones = (await prisma.zone.findMany({ where: { tenantId, isActive: true }, orderBy: { invoiceDay: 'asc' } })).map((z) => ({
      value: z.id,
      label: `${z.name} (factura día ${z.invoiceDay}, corte día ${z.suspendDay})`,
    }))
    return (
      <Panel title="Información Personal" action={<span className="text-xs text-muted-foreground">Cliente desde {formatDay(customer.createdAt, tz)}</span>}>
        <CustomerForm action={updateCustomer.bind(null, customer.id)} customer={customer} zones={zones} submitLabel="Guardar datos" showTitle={false} />
      </Panel>
    )
  }
  return (
    <Panel title="Información Personal">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        <Info label="Nombre completo">
          {customer.firstName} {customer.lastName}
        </Info>
        <Info label="Cédula">{customer.cedula ?? '—'}</Info>
        <Info label="Teléfono">{[customer.phone, customer.phone2].filter(Boolean).join(' · ') || '—'}</Info>
        <Info label="Correo">{[customer.email, customer.email2].filter(Boolean).join(' · ') || '—'}</Info>
        <Info label="Ubicación">{[customer.neighborhood, customer.city, customer.province].filter(Boolean).join(' · ') || '—'}</Info>
        <Info label="Dirección">{customer.address ?? '—'}</Info>
        <Info label="Coordenadas">
          {customer.coordinates ? (
            <a className="text-blue-700 hover:underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${encodeURIComponent(customer.coordinates)}`}>
              {customer.coordinates}
            </a>
          ) : (
            '—'
          )}
        </Info>
        <Info label="Cliente desde">{formatDay(customer.createdAt, tz)}</Info>
        {customer.notes && (
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Notas</dt>
            <dd className="whitespace-pre-line">{customer.notes}</dd>
          </div>
        )}
      </dl>
    </Panel>
  )
}

// ── Servicios ───────────────────────────────────────────────

async function ServicesSection({
  customerId,
  tenantId,
  role,
  canWrite,
  currency,
  tz,
}: {
  customerId: string
  tenantId: string
  role: Parameters<typeof can>[0]
  canWrite: boolean
  currency: string
  tz: string
}) {
  const customer = await prisma.customer.findUniqueOrThrow({
    where: { id: customerId },
    include: {
      services: { include: { plan: true, router: { select: { name: true } } }, orderBy: { createdAt: 'asc' } },
      devices: { orderBy: { createdAt: 'asc' } },
      onus: { include: { olt: { select: { name: true, frame: true } }, napBox: { select: { name: true } }, speedPlan: { select: { name: true } } } },
    },
  })
  const oltSettings = await getOltSettings(tenantId)
  const [plans, routers] = canWrite
    ? await Promise.all([
        prisma.plan.findMany({ where: { tenantId, isActive: true }, orderBy: { price: 'asc' } }),
        prisma.router.findMany({ where: { tenantId }, orderBy: { name: 'asc' } }),
      ])
    : [[], []]

  return (
    <>
      <DataTable
        title="Servicios"
        headers={['Plan', 'Velocidad', 'Precio', 'Modo', 'IP / PPPoE', 'Router', 'Estado', 'En el router', '']}
        rowCount={customer.services.length}
        emptyText="Sin servicios contratados."
      >
        {customer.services.map((s) => (
          <tr key={s.id}>
            <td className="font-medium">{s.plan.name}</td>
            <td>
              {s.plan.download}/{s.plan.upload} Mbps
            </td>
            <td>
              {formatCurrency(Math.max(0, Number(s.plan.price) - Number(s.discount)), currency)}
              {Number(s.discount) > 0 && (
                <div className="text-xs text-green-700">
                  Desc. {formatCurrency(s.discount, currency)}
                  {s.discountNote ? ` · ${s.discountNote}` : ''}
                </div>
              )}
            </td>
            <td>
              {CLIENT_MODE[s.mode]}
              {s.accessType && <div className="text-xs text-muted-foreground">{s.accessType === 'FIBER' ? 'Fibra' : `Antena${s.accessPoint ? ` · ${s.accessPoint}` : ''}`}</div>}
            </td>
            <td>
              {s.ipAddress ?? '—'}
              {s.pppoeUser && <div className="text-xs text-muted-foreground">{s.pppoeUser}</div>}
              {s.ipv6 && <div className="font-mono text-xs text-muted-foreground">{s.ipv6}</div>}
              {(s.lanInterface || s.wanInterface) && (
                <div className="text-xs text-muted-foreground">{[s.lanInterface && `LAN ${s.lanInterface}`, s.wanInterface && `WAN ${s.wanInterface}`].filter(Boolean).join(' · ')}</div>
              )}
              {!s.syncRouter && <div className="text-xs text-amber-700">Solo panel</div>}
            </td>
            <td>{s.router?.name ?? '—'}</td>
            <td>
              <StatusBadge value={s.isActive ? 'ACTIVE' : 'INACTIVE'} />
            </td>
            <td>
              {s.router ? (
                <span className={s.networkState === 'SUSPENDED' ? 'font-medium text-red-600' : 'text-green-700'}>{s.networkState === 'SUSPENDED' ? 'Cortado' : 'Habilitado'}</span>
              ) : (
                <span className="text-xs text-muted-foreground">Sin router</span>
              )}
            </td>
            <td className="space-x-1 text-right">
              {canWrite && (
                <>
                  <ActionButton action={toggleService} fields={{ id: s.id }} variant="outline" size="sm">
                    {s.isActive ? 'Desactivar' : 'Activar'}
                  </ActionButton>
                  <ActionButton action={deleteService} fields={{ id: s.id }} variant="ghost" size="sm" className="text-red-600" confirm="¿Eliminar este servicio?">
                    Eliminar
                  </ActionButton>
                </>
              )}
            </td>
          </tr>
        ))}
      </DataTable>

      {canWrite && (
        <Card>
          <CardHeader>
            <CardTitle>Agregar servicio</CardTitle>
          </CardHeader>
          <CardContent>
            <ServiceForm
              action={addService.bind(null, customer.id)}
              plans={plans.map((p) => ({ value: p.id, kind: p.kind, label: `${p.name} · ${p.kind === 'PPPOE' ? 'PPPoE' : 'Simple Queue'} · ${p.download}/${p.upload} Mbps · ${formatCurrency(p.price, currency)}` }))}
              routers={routers.map((r) => ({ value: r.id, label: `${r.name} (${r.host})` }))}
            />
          </CardContent>
        </Card>
      )}

      {customer.onus.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Fibra (ONU)</CardTitle>
            {can(role, 'olt') && (
              <Link href={`/dashboard/olt/onus?q=${encodeURIComponent(customer.onus[0].serial)}`} className="text-sm text-blue-700 hover:underline">
                Ver en OLT
              </Link>
            )}
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {customer.onus.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center gap-x-5 gap-y-1 py-2">
                  <span className="font-mono text-xs font-semibold">{o.serial}</span>
                  <span>
                    {o.olt.name} {o.authState === 'AUTHORIZED' && <span className="font-mono text-xs text-muted-foreground">{pon(o.olt.frame, o.slot, o.port, o.onuIndex)}</span>}
                  </span>
                  {o.authState === 'AUTHORIZED' ? (
                    o.inOlt ? <OnuStatus status={o.status} /> : <span className="text-xs text-muted-foreground">No aparece en la OLT</span>
                  ) : (
                    <span className={o.authState === 'FAILED' ? 'text-xs font-semibold text-red-700' : 'text-xs text-amber-700'}>
                      {AUTH_LABEL[o.authState]}
                      {o.authError ? ` — ${o.authError}` : ''}
                    </span>
                  )}
                  {o.authState === 'AUTHORIZED' && <RxPower value={o.rxPower} low={oltSettings.lowSignal} critical={oltSettings.criticalSignal} />}
                  {o.speedPlan && <span className="text-xs text-muted-foreground">{o.speedPlan.name}</span>}
                  {o.napBox && (
                    <span className="text-xs text-muted-foreground">
                      NAP {o.napBox.name}
                      {o.napPort ? ` · puerto ${o.napPort}` : ''}
                    </span>
                  )}
                  {o.lastSeenAt && <span className="text-xs text-muted-foreground">leída {formatDateTime(o.lastSeenAt, tz)}</span>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {can(role, 'devices') && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Wifi Router</CardTitle>
            <Link href={`/dashboard/customers/devices?customerId=${customer.id}`} className="text-sm text-blue-700 hover:underline">
              {customer.devices.length ? 'Ver claves y editar' : 'Registrar equipo'}
            </Link>
          </CardHeader>
          <CardContent>
            {customer.devices.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin equipos registrados.</p>
            ) : (
              <ul className="divide-y text-sm">
                {customer.devices.map((d) => (
                  <li key={d.id} className="flex flex-wrap gap-x-4 gap-y-1 py-2">
                    <span className="font-medium">{[d.brand, d.model].filter(Boolean).join(' ') || 'Equipo'}</span>
                    {d.ssid && <span>Red: {d.ssid}</span>}
                    {d.macAddress && <span className="font-mono text-xs">{d.macAddress}</span>}
                    {d.managementIp && <span className="font-mono text-xs">{d.managementIp}</span>}
                    {d.serial && <span className="text-muted-foreground">Serie {d.serial}</span>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </>
  )
}

// ── Facturas y pagos ────────────────────────────────────────

async function InvoicesSection({ customerId, canBill, currency }: { customerId: string; canBill: boolean; currency: string }) {
  const [invoices, payments] = await Promise.all([
    prisma.invoice.findMany({ where: { customerId }, orderBy: { issueDate: 'desc' }, take: 24 }),
    prisma.payment.findMany({ where: { customerId }, orderBy: { paidDate: 'desc' }, take: 24, include: { invoice: { select: { number: true } } } }),
  ])
  return (
    <>
      <DataTable
        title="Facturas"
        headers={['Número', 'Concepto', 'Emisión', 'Vence', 'Monto', 'Estado']}
        rowCount={invoices.length}
        emptyText="Sin facturas."
        actions={
          canBill ? (
            <Button asChild size="sm">
              <Link href={`/dashboard/billing/new?customerId=${customerId}`}>
                <Plus className="mr-1 h-4 w-4" />
                Nueva factura
              </Link>
            </Button>
          ) : undefined
        }
      >
        {invoices.map((i) => (
          <tr key={i.id}>
            <td>
              <Link href={`/dashboard/billing/${i.id}`} className="font-medium text-blue-700 hover:underline">
                {i.number}
              </Link>
            </td>
            <td className="max-w-xs truncate text-xs text-muted-foreground">{i.description}</td>
            <td>{formatDate(i.issueDate)}</td>
            <td>{formatDate(i.dueDate)}</td>
            <td>{formatCurrency(i.amount, currency)}</td>
            <td>
              <StatusBadge value={i.status} />
            </td>
          </tr>
        ))}
      </DataTable>

      <DataTable title="Pagos" headers={['Fecha', 'Monto', 'Método', 'Factura', 'Estado']} rowCount={payments.length} emptyText="Sin pagos.">
        {payments.map((p) => (
          <tr key={p.id}>
            <td>{formatDate(p.paidDate)}</td>
            <td>{formatCurrency(toNumber(p.amount), currency)}</td>
            <td>{PAYMENT_METHOD[p.method]}</td>
            <td>{p.invoice?.number ?? '—'}</td>
            <td>
              <StatusBadge value={p.status} />
            </td>
          </tr>
        ))}
      </DataTable>
    </>
  )
}

// ── Promesas de pago ────────────────────────────────────────

const PROMISE_LABEL: Record<string, [string, string]> = {
  ACTIVE: ['Activa', 'bg-blue-100 text-blue-800'],
  FULFILLED: ['Cumplida', 'bg-green-100 text-green-800'],
  BROKEN: ['Incumplida', 'bg-red-100 text-red-800'],
  CANCELLED: ['Cancelada', 'bg-gray-100 text-gray-700'],
}

async function PromisesSection({ customerId, canFinance, currency, tz }: { customerId: string; canFinance: boolean; currency: string; tz: string }) {
  const promises = await prisma.paymentPromise.findMany({
    where: { customerId },
    orderBy: { createdAt: 'desc' },
    take: 30,
    include: { invoice: { select: { number: true } } },
  })
  return (
    <DataTable
      title="Promesas de Pago"
      headers={['Prometido para', 'Monto', 'Factura', 'Estado', 'Notas', 'Registrada']}
      rowCount={promises.length}
      emptyText="Este cliente no tiene promesas de pago."
      actions={
        canFinance ? (
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/finance/promises">
              <Plus className="mr-1 h-4 w-4" />
              Registrar promesa
            </Link>
          </Button>
        ) : undefined
      }
    >
      {promises.map((p) => {
        const [label, color] = PROMISE_LABEL[p.status]
        return (
          <tr key={p.id}>
            <td className="font-medium">{formatDay(p.promisedDate, 'UTC')}</td>
            <td>{p.amount ? formatCurrency(p.amount, currency) : 'Toda la deuda'}</td>
            <td>{p.invoice?.number ?? '—'}</td>
            <td>
              <span className={cn('rounded px-2 py-0.5 text-xs font-semibold', color)}>{label}</span>
            </td>
            <td className="max-w-xs truncate text-xs text-muted-foreground">{p.notes ?? '—'}</td>
            <td className="text-xs text-muted-foreground">{formatDateTime(p.createdAt, tz)}</td>
          </tr>
        )
      })}
    </DataTable>
  )
}

// ── Soporte ─────────────────────────────────────────────────

async function SupportSection({ customerId, canSupport, tz }: { customerId: string; canSupport: boolean; tz: string }) {
  const tickets = await prisma.ticket.findMany({ where: { customerId }, orderBy: { createdAt: 'desc' }, take: 30 })
  return (
    <DataTable
      title="Tickets de soporte"
      headers={['Título', 'Prioridad', 'Estado', 'Creado']}
      rowCount={tickets.length}
      emptyText="Sin tickets."
      actions={
        canSupport ? (
          <Button asChild size="sm">
            <Link href={`/dashboard/support/new?customerId=${customerId}`}>
              <ClipboardList className="mr-1 h-4 w-4" />
              Nuevo ticket
            </Link>
          </Button>
        ) : undefined
      }
    >
      {tickets.map((t) => (
        <tr key={t.id}>
          <td>
            <Link href={`/dashboard/support/${t.id}`} className="font-medium text-blue-700 hover:underline">
              {t.title}
            </Link>
          </td>
          <td>
            <StatusBadge value={t.priority} />
          </td>
          <td>
            <StatusBadge value={t.status} />
          </td>
          <td>{formatDay(t.createdAt, tz)}</td>
        </tr>
      ))}
    </DataTable>
  )
}

// ── Log ─────────────────────────────────────────────────────

const ACTION_STATUS: Record<string, string> = {
  PENDING: 'Pendiente',
  RUNNING: 'Ejecutando',
  DONE: 'Aplicada',
  FAILED: 'Fallida',
  CANCELLED: 'Cancelada',
}

async function LogSection({ customerId, tenantId, canRetry, tz }: { customerId: string; tenantId: string; canRetry: boolean; tz: string }) {
  const [actions, logs] = await Promise.all([
    prisma.networkAction.findMany({ where: { customerId }, orderBy: { createdAt: 'desc' }, take: 30, include: { router: { select: { name: true } } } }),
    prisma.auditLog.findMany({
      where: { tenantId, entity: 'Customer', entityId: customerId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { user: { select: { name: true } } },
    }),
  ])
  return (
    <>
      <DataTable title="Cortes y reconexiones" headers={['Fecha', 'Acción', 'Router', 'Estado', 'Detalle', '']} rowCount={actions.length} emptyText="Sin cortes ni reconexiones registradas.">
        {actions.map((a) => (
          <tr key={a.id}>
            <td>{formatDateTime(a.createdAt, tz)}</td>
            <td>
              {a.type === 'SUSPEND' ? 'Corte' : 'Reconexión'} ({a.source === 'AUTO' ? 'automática' : 'manual'})
            </td>
            <td>{a.router?.name ?? '—'}</td>
            <td>
              {ACTION_STATUS[a.status]}
              {a.attempts > 1 && <span className="text-xs text-muted-foreground"> · {a.attempts} intentos</span>}
            </td>
            <td className="max-w-xs whitespace-normal text-xs">
              {a.reason}
              {a.lastError && <div className="text-red-600">{a.lastError}</div>}
            </td>
            <td className="text-right">
              {canRetry && (a.status === 'FAILED' || a.status === 'PENDING') && (
                <ActionButton action={manageAction} fields={{ id: a.id, op: 'retry' }} variant="outline" size="sm">
                  Reintentar
                </ActionButton>
              )}
            </td>
          </tr>
        ))}
      </DataTable>

      <DataTable title="Actividad" headers={['Fecha', 'Usuario', 'Acción']} rowCount={logs.length} emptyText="Sin actividad registrada.">
        {logs.map((l) => (
          <tr key={l.id}>
            <td>{formatDateTime(l.createdAt, tz)}</td>
            <td>{l.user?.name ?? 'Sistema'}</td>
            <td className="font-mono text-xs">{l.action}</td>
          </tr>
        ))}
      </DataTable>
    </>
  )
}

// ── Configuración ───────────────────────────────────────────

async function ConfigSection({ customerId, tenantId, canWrite, tz }: { customerId: string; tenantId: string; canWrite: boolean; tz: string }) {
  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customerId }, include: { zone: true, tenant: { select: { timezone: true } } } })
  const local = localNowIn(customer.tenant.timezone)
  const cycle = customer.zone ? cycleInfo(customer.zone, lastCycleStart(customer.zone, local)) : null
  const nextInvoice = customer.zone ? nextCycleStart(customer.zone, local) : null
  const [zones, zoneHistory] = await Promise.all([
    prisma.zone.findMany({ where: { tenantId, isActive: true }, orderBy: { invoiceDay: 'asc' } }),
    prisma.auditLog.findMany({
      where: { tenantId, entity: 'Customer', entityId: customer.id, action: 'customer.zone' },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { user: { select: { name: true } } },
    }),
  ])

  return (
    <>
      <Panel title="Zona de facturación">
        <div className="space-y-4">
          {customer.zone && cycle && nextInvoice ? (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-5">
              <Info label="Zona">
                <Link href={`/dashboard/zones/${customer.zone.id}`} className="font-medium text-blue-700 hover:underline">
                  {customer.zone.name}
                </Link>
              </Info>
              <Info label="Ciclo actual (factura)">{formatDate(cycle.cycleDate)}</Info>
              <Info label="Límite de pago">{formatDate(cycle.dueDate)}</Info>
              <Info label="Fecha de corte">{formatDate(cycle.suspendDate)}</Info>
              <Info label="Próxima factura">{formatDate(nextInvoice)}</Info>
            </dl>
          ) : (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">Sin zona asignada: este cliente no se factura ni se corta automáticamente.</p>
          )}
          <div className="flex flex-wrap items-end gap-4 text-sm">
            {canWrite && <ZoneSelectForm action={changeZone.bind(null, customer.id)} zones={zones.map((z) => ({ value: z.id, label: z.name }))} current={customer.zoneId} />}
            {customer.suspendExempt && <span className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-800">Exento de corte automático</span>}
          </div>
          {zoneHistory.length > 0 && (
            <ul className="text-xs text-muted-foreground">
              {zoneHistory.map((h) => {
                const d = (h.details ?? {}) as { fromName?: string | null; toName?: string | null }
                return (
                  <li key={h.id}>
                    {formatDateTime(h.createdAt, tz)}: {d.fromName ?? 'Sin zona'} → {d.toName ?? 'Sin zona'}
                    {h.user ? ` (por ${h.user.name})` : ''}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </Panel>

      <Panel title="Estado del cliente">
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">Estado actual:</span>
            <StatusBadge value={customer.status} />
          </div>
          {customer.status === 'SUSPENDED' && (
            <p className="text-xs text-muted-foreground">
              Suspendido{' '}
              {customer.suspensionSource === 'AUTO' ? 'automáticamente por falta de pago (se reconecta solo al pagar)' : 'manualmente (reconéctalo con «Activo»)'}
              {customer.suspendedAt && ` el ${formatDateTime(customer.suspendedAt, tz)}`}
            </p>
          )}
          {customer.reconnectedAt && customer.status === 'ACTIVE' && (
            <p className="text-xs text-muted-foreground">Última reconexión: {formatDateTime(customer.reconnectedAt, tz)}</p>
          )}
          {canWrite && (
            <>
              <p className="text-muted-foreground">Cambiar estado (también corta o reconecta en el router):</p>
              <div className="flex flex-wrap gap-2">
                {(['ACTIVE', 'SUSPENDED', 'CANCELLED'] as const)
                  .filter((s) => s !== customer.status)
                  .map((s) => (
                    <ActionButton
                      key={s}
                      action={setCustomerStatus}
                      fields={{ id: customer.id, status: s }}
                      variant="outline"
                      size="sm"
                      confirm={`¿Cambiar el estado a "${CUSTOMER_STATUS[s]}"?`}
                    >
                      {CUSTOMER_STATUS[s]}
                    </ActionButton>
                  ))}
              </div>
            </>
          )}
        </div>
      </Panel>

      {canWrite && (
        <Panel title="Eliminar cliente">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <p className="text-muted-foreground">Solo se puede eliminar si no tiene facturas ni pagos. Si los tiene, cámbialo a «Cancelado».</p>
            <ActionButton
              action={deleteCustomer}
              fields={{ id: customer.id }}
              variant="outline"
              size="sm"
              className="border-red-200 text-red-600 hover:bg-red-50"
              confirm="¿Eliminar este cliente? No se puede deshacer."
            >
              Eliminar cliente
            </ActionButton>
          </div>
        </Panel>
      )}
    </>
  )
}
