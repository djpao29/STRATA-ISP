import type { Prisma } from '@prisma/client'

type Params = Record<string, string | string[] | undefined>
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined

export const CUSTOMER_TABS = [
  { value: '', label: 'Todos' },
  { value: 'activos', label: 'Activos' },
  { value: 'suspendidos', label: 'Suspendidos' },
  { value: 'retirados', label: 'Retirados' },
  { value: 'pendientes', label: 'Pendientes' },
  { value: 'sin-servicio', label: 'Sin servicio' },
] as const

export const SUSPENDED_RANGES = [
  { value: '', label: 'Todo el tiempo' },
  { value: '7', label: 'Últimos 7 días' },
  { value: '30', label: 'Últimos 30 días' },
  { value: '90', label: 'Últimos 90 días' },
] as const

export const PAGE_SIZES = [15, 25, 50, 100]

export const SORTS = ['code', 'name', 'zone', 'suspended'] as const
export type CustomerSort = (typeof SORTS)[number]

/** Filtros de la lista de clientes, leídos de la URL (los usan la página y la exportación). */
export function readCustomerFilters(sp: Params) {
  const tab = one(sp.tab) ?? ''
  const sort = (SORTS as readonly string[]).includes(one(sp.sort) ?? '') ? (one(sp.sort) as CustomerSort) : 'code'
  const per = Number(one(sp.per))
  return {
    q: one(sp.q),
    tab: CUSTOMER_TABS.some((t) => t.value === tab) ? tab : '',
    zone: one(sp.zone),
    plan: one(sp.plan),
    router: one(sp.router),
    invoices: one(sp.invoices) === 'con' || one(sp.invoices) === 'sin' ? one(sp.invoices) : undefined,
    promise: one(sp.promise) === 'con' || one(sp.promise) === 'sin' ? one(sp.promise) : undefined,
    suspended: SUSPENDED_RANGES.some((r) => r.value && r.value === one(sp.suspended)) ? one(sp.suspended) : undefined,
    sort,
    dir: one(sp.dir) === 'desc' ? ('desc' as const) : ('asc' as const),
    per: PAGE_SIZES.includes(per) ? per : 15,
  }
}

export type CustomerFilters = ReturnType<typeof readCustomerFilters>

const OPEN_INVOICE: Prisma.InvoiceWhereInput = { status: { in: ['PENDING', 'OVERDUE'] } }

export function customerWhere(tenantId: string, f: CustomerFilters): Prisma.CustomerWhereInput {
  const and: Prisma.CustomerWhereInput[] = [{ tenantId }]
  if (f.tab === 'activos') and.push({ status: 'ACTIVE' })
  if (f.tab === 'suspendidos') and.push({ status: 'SUSPENDED' })
  if (f.tab === 'retirados') and.push({ status: 'CANCELLED' })
  if (f.tab === 'pendientes') and.push({ status: 'PENDING' })
  if (f.tab === 'sin-servicio') and.push({ services: { none: { isActive: true } } })
  if (f.zone) and.push({ zoneId: f.zone === 'none' ? null : f.zone })
  if (f.plan) and.push({ services: { some: { planId: f.plan, isActive: true } } })
  if (f.router) and.push({ services: { some: { routerId: f.router, isActive: true } } })
  if (f.invoices === 'con') and.push({ invoices: { some: OPEN_INVOICE } })
  if (f.invoices === 'sin') and.push({ invoices: { none: OPEN_INVOICE } })
  if (f.promise === 'con') and.push({ paymentPromises: { some: { status: 'ACTIVE' } } })
  if (f.promise === 'sin') and.push({ paymentPromises: { none: { status: 'ACTIVE' } } })
  if (f.suspended) and.push({ status: 'SUSPENDED', suspendedAt: { gte: new Date(Date.now() - Number(f.suspended) * 86_400_000) } })
  if (f.q) {
    const q = f.q
    and.push({
      OR: [
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { cedula: { contains: q } },
        { phone: { contains: q } },
        { phone2: { contains: q } },
        { email: { contains: q, mode: 'insensitive' } },
        { address: { contains: q, mode: 'insensitive' } },
        { services: { some: { OR: [{ ipAddress: { startsWith: q } }, { pppoeUser: { contains: q, mode: 'insensitive' } }] } } },
        ...(/^c?-?\d+$/i.test(q) ? [{ code: Number(q.replace(/\D/g, '')) }] : []),
        // "Juan Pérez": nombre y apellido a la vez.
        ...(q.includes(' ')
          ? [{ AND: q.split(/\s+/).map((w) => ({ OR: [{ firstName: { contains: w, mode: 'insensitive' as const } }, { lastName: { contains: w, mode: 'insensitive' as const } }] })) }]
          : []),
      ],
    })
  }
  return { AND: and }
}

export function customerOrder(f: CustomerFilters): Prisma.CustomerOrderByWithRelationInput[] {
  const d = f.dir
  if (f.sort === 'name') return [{ firstName: d }, { lastName: d }]
  if (f.sort === 'zone') return [{ zone: { name: d } }, { code: 'asc' }]
  if (f.sort === 'suspended') return [{ suspendedAt: { sort: d, nulls: 'last' } }, { code: 'asc' }]
  return [{ code: { sort: d, nulls: 'last' } }, { createdAt: d }]
}

/** Parámetros de URL sin los vacíos ni los valores por defecto. */
export function filterParams(f: CustomerFilters, over: Partial<Record<keyof CustomerFilters | 'page', string | number | undefined>> = {}) {
  const all: Record<string, string | number | undefined> = { ...f, ...over }
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(all)) {
    if (v === undefined || v === '' || v === null) continue
    if (k === 'sort' && v === 'code') continue
    if (k === 'dir' && v === 'asc') continue
    if (k === 'per' && Number(v) === 15) continue
    if (k === 'page' && Number(v) <= 1) continue
    sp.set(k, String(v))
  }
  return sp
}
