import Link from 'next/link'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, UserPlus, Users } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { can } from '@/lib/permissions'
import { formatCurrency, formatDay } from '@/lib/format'
import { formatCustomerCode } from '@/lib/zones/billing'
import { cn } from '@/lib/utils'
import {
  CUSTOMER_TABS,
  PAGE_SIZES,
  SUSPENDED_RANGES,
  customerOrder,
  customerWhere,
  filterParams,
  readCustomerFilters,
  type CustomerFilters,
  type CustomerSort,
} from '@/lib/customer-list'
import { deleteCustomer, setCustomerStatus } from './actions'
import { CustomerRow, type CustomerRowData } from './customer-row'
import { ExportButtons, FilterSelect, SearchBox, Tabs } from './list-filters'

export const metadata = { title: 'Clientes' }

type Props = { searchParams: Record<string, string | string[] | undefined> }

export default async function CustomersPage({ searchParams }: Props) {
  const user = await requireUser('customers')
  const f = readCustomerFilters(searchParams)
  const where = customerWhere(user.tenantId, f)
  const currency = user.tenant.currency
  const tz = user.tenant.timezone

  const total = await prisma.customer.count({ where })
  const pages = Math.max(1, Math.ceil(total / f.per))
  const page = Math.min(pages, Math.max(1, Number(Array.isArray(searchParams.page) ? searchParams.page[0] : searchParams.page) || 1))

  // Conteos de las pestañas con el resto de filtros aplicados.
  const tabCounts = await Promise.all(CUSTOMER_TABS.map((t) => prisma.customer.count({ where: customerWhere(user.tenantId, { ...f, tab: t.value }) })))

  const [customers, serviceCount, zones, plans, routers] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: customerOrder(f),
      skip: (page - 1) * f.per,
      take: f.per,
      include: {
        zone: { select: { name: true } },
        services: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            isActive: true,
            networkState: true,
            mode: true,
            ipAddress: true,
            pppoeUser: true,
            plan: { select: { name: true } },
            router: { select: { name: true } },
          },
        },
        paymentPromises: { where: { status: 'ACTIVE' }, orderBy: { promisedDate: 'asc' }, take: 1, select: { promisedDate: true } },
      },
    }),
    prisma.service.count({ where: { isActive: true, customer: where } }),
    prisma.zone.findMany({ where: { tenantId: user.tenantId }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.plan.findMany({ where: { tenantId: user.tenantId }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.router.findMany({ where: { tenantId: user.tenantId }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ])
  const ids = customers.map((c) => c.id)
  const open = ids.length
    ? await prisma.invoice.groupBy({
        by: ['customerId'],
        where: { customerId: { in: ids }, status: { in: ['PENDING', 'OVERDUE'] } },
        _sum: { amount: true },
        _count: true,
      })
    : []

  const rows: CustomerRowData[] = customers.map((c) => {
    const inv = open.find((o) => o.customerId === c.id)
    return {
      id: c.id,
      code: formatCustomerCode(c.code),
      name: `${c.firstName} ${c.lastName}`.trim(),
      cedula: c.cedula,
      status: c.status,
      zone: c.zone?.name ?? null,
      phone: c.phone,
      address: [c.address, c.neighborhood, c.city].filter(Boolean).join(', ') || null,
      suspendedAt: c.suspendedAt ? formatDay(c.suspendedAt, tz) : null,
      suspendedPlans: c.services.filter((s) => s.isActive).map((s) => s.plan.name),
      services: c.services.map((s) => ({
        id: s.id,
        plan: s.plan.name,
        access: s.mode === 'PPPoE' ? `PPPoE ${s.pppoeUser ?? '—'}${s.ipAddress ? ` · ${s.ipAddress}` : ''}` : s.ipAddress ?? 'Sin IP',
        router: s.router?.name ?? null,
        active: s.isActive,
        cut: s.networkState === 'SUSPENDED',
      })),
      pending: inv?._sum.amount && Number(inv._sum.amount) > 0 ? formatCurrency(inv._sum.amount, currency) : null,
      pendingCount: inv?._count ?? 0,
      promise: c.paymentPromises[0] ? formatDay(c.paymentPromises[0].promisedDate, 'UTC') : null,
    }
  })

  const canWrite = can(user.role, 'customersWrite')
  const href = (over: Parameters<typeof filterParams>[1]) => {
    const s = filterParams(f, over).toString()
    return `/dashboard/customers${s ? `?${s}` : ''}`
  }
  const opt = (all: string, list: Array<{ id: string; name: string }>) => [{ value: '', label: all }, ...list.map((x) => ({ value: x.id, label: x.name }))]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Gestión de Clientes</h1>
        {canWrite && (
          <Link
            href="/dashboard/customers/new"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 print:hidden"
          >
            <UserPlus className="h-4 w-4" />
            Nuevo cliente
          </Link>
        )}
      </div>

      <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <Tabs tabs={CUSTOMER_TABS} value={f.tab} counts={Object.fromEntries(CUSTOMER_TABS.map((t, i) => [t.value, tabCounts[i]]))} />
          <div className="ml-auto">
            <SearchBox value={f.q} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect name="zone" label="Zona" value={f.zone} options={[...opt('Todas las zonas', zones), { value: 'none', label: 'Sin zona' }]} />
          <FilterSelect name="plan" label="Plan" value={f.plan} options={opt('Todos los planes', plans)} />
          <FilterSelect name="router" label="Router" value={f.router} options={opt('Todos los routers', routers)} />
          <FilterSelect
            name="invoices"
            label="Facturas"
            value={f.invoices}
            options={[
              { value: '', label: 'Con y sin facturas' },
              { value: 'con', label: 'Con facturas pendientes' },
              { value: 'sin', label: 'Sin facturas pendientes' },
            ]}
          />
          <FilterSelect
            name="promise"
            label="Promesa de pago"
            value={f.promise}
            options={[
              { value: '', label: 'Promesa: todos' },
              { value: 'con', label: 'Con promesa activa' },
              { value: 'sin', label: 'Sin promesa' },
            ]}
          />
          <div className="ml-auto">
            <ExportButtons canExport={can(user.role, 'customers')} />
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-4 py-3 text-sm text-gray-600">
          <Users className="h-4 w-4 text-gray-400" />
          <span>
            Total: <strong className="text-gray-900">{total}</strong> titular(es) ({serviceCount} servicio(s) activo(s))
          </span>
          <span className="ml-auto flex items-center gap-2 print:hidden">
            Mostrar:
            <FilterSelect name="per" label="Clientes por página" value={f.per === 15 ? '' : String(f.per)} options={PAGE_SIZES.map((n) => ({ value: n === 15 ? '' : String(n), label: String(n) }))} />
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                <SortTh f={f} sort="code" href={href} label="ID" className="w-32" />
                <SortTh f={f} sort="name" href={href} label="Nombre" />
                <SortTh f={f} sort="zone" href={href} label="Zona" />
                <th className="px-3 py-2.5">
                  <SortLink f={f} sort="suspended" href={href} label="Suspendido" />
                  <div className="mt-1 normal-case print:hidden">
                    <FilterSelect name="suspended" label="Suspendidos desde" value={f.suspended} options={SUSPENDED_RANGES.map((r) => ({ value: r.value, label: r.label }))} />
                  </div>
                </th>
                <th className="px-3 py-2.5">Contacto</th>
                <th className="px-3 py-2.5 text-center">Estado</th>
                <th className="px-3 py-2.5">Pendiente</th>
                <th className="px-3 py-2.5 text-right print:hidden">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <CustomerRow key={c.id} c={c} canWrite={canWrite} setStatus={setCustomerStatus} remove={deleteCustomer} />
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-sm text-gray-500">
                    {total === 0 && !f.q && !f.tab ? 'Todavía no hay clientes. Crea el primero.' : 'Ningún cliente coincide con el filtro.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <nav className="flex items-center justify-center gap-1 border-t border-gray-100 px-4 py-3 print:hidden" aria-label="Páginas">
            <PageLink href={href({ page: page - 1 })} disabled={page <= 1} label="Anterior">
              <ChevronLeft className="h-4 w-4" />
            </PageLink>
            {pageList(page, pages).map((p, i) =>
              p === 0 ? (
                <span key={`gap-${i}`} className="px-1 text-gray-400">
                  …
                </span>
              ) : (
                <PageLink key={p} href={href({ page: p })} current={p === page} label={`Página ${p}`}>
                  {p}
                </PageLink>
              )
            )}
            <PageLink href={href({ page: page + 1 })} disabled={page >= pages} label="Siguiente">
              <ChevronRight className="h-4 w-4" />
            </PageLink>
          </nav>
        )}
      </div>
    </div>
  )
}

type HrefFn = (over: Parameters<typeof filterParams>[1]) => string

function SortLink({ f, sort, href, label }: { f: CustomerFilters; sort: CustomerSort; href: HrefFn; label: string }) {
  const active = f.sort === sort
  const Icon = !active ? ArrowUpDown : f.dir === 'asc' ? ArrowUp : ArrowDown
  return (
    <Link href={href({ sort, dir: active && f.dir === 'asc' ? 'desc' : 'asc', page: 1 })} className={cn('inline-flex items-center gap-1 hover:text-gray-900', active && 'text-gray-900')}>
      {label}
      <Icon className={cn('h-3 w-3', !active && 'opacity-40')} />
    </Link>
  )
}

function SortTh(props: { f: CustomerFilters; sort: CustomerSort; href: HrefFn; label: string; className?: string }) {
  return (
    <th className={cn('px-3 py-2.5', props.className)}>
      <SortLink {...props} />
    </th>
  )
}

function PageLink({ href, children, current, disabled, label }: { href: string; children: React.ReactNode; current?: boolean; disabled?: boolean; label: string }) {
  const cls = cn(
    'flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-sm',
    current ? 'border-indigo-600 bg-indigo-600 font-semibold text-white' : 'border-gray-200 text-gray-600 hover:bg-gray-50',
    disabled && 'pointer-events-none opacity-40'
  )
  if (disabled) return <span className={cls} aria-label={label}>{children}</span>
  return (
    <Link href={href} className={cls} aria-label={label} aria-current={current ? 'page' : undefined}>
      {children}
    </Link>
  )
}

/** 1 … 4 5 [6] 7 8 … 23 (0 = hueco). */
function pageList(page: number, pages: number) {
  const set = new Set([1, pages, page - 2, page - 1, page, page + 1, page + 2].filter((p) => p >= 1 && p <= pages))
  const sorted = [...set].sort((a, b) => a - b)
  const out: number[] = []
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push(0)
    out.push(p)
  })
  return out
}
