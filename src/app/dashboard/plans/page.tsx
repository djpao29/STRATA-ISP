import Link from 'next/link'
import type { PlanKind, Prisma } from '@prisma/client'
import { ChevronLeft, ChevronRight, Download, Eye, RefreshCw, Search, Trash2, Wifi } from 'lucide-react'
import { ActionButton } from '@/components/forms/action-form'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import { deletePlan, savePlan, syncPlan } from './actions'
import { PageSizeSelect, PlanDialog } from './plan-form'
import { ImportProfilesForm } from './import-form'

export const metadata = { title: 'Planes' }

type Props = { searchParams: { tipo?: string; q?: string; per?: string; page?: string } }

const SIZES = [15, 25, 50, 100]

export default async function PlansPage({ searchParams }: Props) {
  const user = await requireUser('plans')
  const kind: PlanKind = searchParams.tipo === 'pppoe' ? 'PPPOE' : 'SIMPLE_QUEUE'
  const q = searchParams.q?.trim() || undefined
  const per = SIZES.includes(Number(searchParams.per)) ? Number(searchParams.per) : 15
  const currency = user.tenant.currency

  const where: Prisma.PlanWhereInput = {
    tenantId: user.tenantId,
    kind,
    ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { pppProfile: { contains: q, mode: 'insensitive' } }] } : {}),
  }
  const total = await prisma.plan.count({ where })
  const pages = Math.max(1, Math.ceil(total / per))
  const page = Math.min(pages, Math.max(1, Number(searchParams.page) || 1))

  const [plans, routers] = await Promise.all([
    prisma.plan.findMany({
      where,
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      skip: (page - 1) * per,
      take: per,
    }),
    prisma.router.findMany({ where: { tenantId: user.tenantId, type: 'MIKROTIK' }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ])
  const ids = plans.map((p) => p.id)
  const [inService, suspended] = ids.length
    ? await Promise.all([
        prisma.service.groupBy({ by: ['planId'], where: { planId: { in: ids }, isActive: true, customer: { status: 'ACTIVE' } }, _count: true }),
        prisma.service.groupBy({ by: ['planId'], where: { planId: { in: ids }, isActive: true, customer: { status: 'SUSPENDED' } }, _count: true }),
      ])
    : [[], []]
  const n = (rows: typeof inService, id: string) => rows.find((r) => r.planId === id)?._count ?? 0

  const href = (over: Partial<{ tipo: string; q: string; per: number; page: number }>) => {
    const p = new URLSearchParams()
    const tipo = over.tipo ?? (kind === 'PPPOE' ? 'pppoe' : '')
    if (tipo) p.set('tipo', tipo)
    const qq = over.q ?? q
    if (qq) p.set('q', qq)
    const pp = over.per ?? per
    if (pp !== 15) p.set('per', String(pp))
    const pg = over.page ?? 1
    if (pg > 1) p.set('page', String(pg))
    const s = p.toString()
    return `/dashboard/plans${s ? `?${s}` : ''}`
  }
  const action = savePlan.bind(null, null, kind)

  return (
    <div className="space-y-6">
      <ImportProfilesForm kind={kind} routers={routers.map((r) => ({ value: r.id, label: r.name }))} />

      <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
        <div className="flex flex-col gap-3 bg-[#0284c7] px-5 py-4 text-white sm:flex-row sm:items-center sm:justify-between">
          <h1 className="flex items-center gap-2 text-lg font-bold">
            <Wifi className="h-5 w-5" />
            Servicios de internet
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-md bg-white/10 p-0.5 text-xs font-semibold">
              <Link href={href({ tipo: '', q: '', page: 1 })} className={cn('rounded px-3 py-1.5', kind === 'SIMPLE_QUEUE' ? 'bg-white text-sky-700' : 'text-white hover:bg-white/10')}>
                Simple Queue
              </Link>
              <Link href={href({ tipo: 'pppoe', q: '', page: 1 })} className={cn('rounded px-3 py-1.5', kind === 'PPPOE' ? 'bg-white text-sky-700' : 'text-white hover:bg-white/10')}>
                PPPoE
              </Link>
            </div>
            <a
              href={`/api/export?type=plans${kind === 'PPPOE' ? '&tipo=pppoe' : ''}`}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-white px-4 text-sm font-semibold text-gray-900 hover:bg-gray-100"
            >
              <Download className="h-4 w-4" />
              Descargar
            </a>
          </div>
        </div>

        <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-2">
            <PageSizeSelect value={per} hrefFor={Object.fromEntries(SIZES.map((s) => [s, href({ per: s, page: 1 })]))} />
            <div>
              <PlanDialog action={action} kind={kind} currency={currency} />
            </div>
          </div>
          <form className="relative w-full sm:w-64" role="search">
            {kind === 'PPPOE' && <input type="hidden" name="tipo" value="pppoe" />}
            {per !== 15 && <input type="hidden" name="per" value={per} />}
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input name="q" defaultValue={q} placeholder="Buscar…" className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm" />
          </form>
        </div>

        {plans.length === 0 ? (
          <p className="border-t bg-gray-50/60 py-10 text-center text-sm text-muted-foreground">
            {q ? 'Sin planes con esa búsqueda.' : kind === 'PPPOE' ? 'No hay planes PPPoE.' : 'No hay planes Simple Queue.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  <th className="px-5 py-3">Nombre</th>
                  <th className="px-3 py-3">Descarga</th>
                  <th className="px-3 py-3">Subida</th>
                  <th className="px-3 py-3">Precio</th>
                  <th className="px-3 py-3 text-center">Activos</th>
                  <th className="px-3 py-3 text-center">Suspendidos</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {plans.map((p) => (
                  <tr key={p.id} className={cn('hover:bg-gray-50/70', !p.isActive && 'opacity-60')}>
                    <td className="px-5 py-3">
                      <div className="font-semibold uppercase text-gray-900">{p.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.category === 'CORPORATE' ? 'Corporativo' : 'Residencial'}
                        {kind === 'PPPOE' && p.pppProfile && p.pppProfile !== p.name && ` · perfil ${p.pppProfile}`}
                        {kind === 'SIMPLE_QUEUE' && p.burst && ` · burst ${p.burst}`}
                        {!p.isActive && ' · inactivo'}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <strong>{p.download}</strong> <span className="text-muted-foreground">Mbps</span>
                    </td>
                    <td className="px-3 py-3">
                      <strong>{p.upload}</strong> <span className="text-muted-foreground">Mbps</span>
                    </td>
                    <td className="px-3 py-3 font-semibold">
                      {formatCurrency(p.price, currency)}
                      {Number(p.price) <= 0 && <div className="text-xs font-normal text-amber-700">Sin precio: no se factura</div>}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="inline-flex h-7 min-w-7 items-center justify-center rounded bg-teal-500 px-2 text-xs font-bold text-white">{n(inService, p.id)}</span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="inline-flex h-7 min-w-7 items-center justify-center rounded bg-orange-500 px-2 text-xs font-bold text-white">{n(suspended, p.id)}</span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1">
                        <Link href={`/dashboard/plans/${p.id}`} title="Ver clientes" className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-white text-gray-600 hover:bg-gray-50">
                          <Eye className="h-4 w-4" />
                        </Link>
                        <ActionButton
                          action={syncPlan}
                          fields={{ id: p.id }}
                          variant="outline"
                          className="h-8 w-8 p-0"
                          title="Sincronizar con MikroTik"
                          confirm={
                            kind === 'PPPOE'
                              ? `Se creará o ajustará el perfil "${p.pppProfile || p.name}" (${p.upload}M/${p.download}M) en el MikroTik y se asignará a los usuarios PPPoE de los clientes de este plan. ¿Continuar?`
                              : `Se creará o ajustará la cola simple (${p.upload}M/${p.download}M) de cada cliente de este plan en su MikroTik. ¿Continuar?`
                          }
                        >
                          <RefreshCw className="h-4 w-4" />
                        </ActionButton>
                        <PlanDialog
                          action={savePlan.bind(null, p.id, kind)}
                          kind={kind}
                          currency={currency}
                          values={{
                            name: p.name,
                            download: p.download,
                            upload: p.upload,
                            price: p.price.toFixed(2),
                            category: p.category,
                            burst: p.burst,
                            priorityUp: p.priorityUp,
                            priorityDown: p.priorityDown,
                            pppProfile: p.pppProfile,
                          }}
                        />
                        <ActionButton action={deletePlan} fields={{ id: p.id }} variant="outline" className="h-8 w-8 p-0 text-red-600" title="Eliminar" confirm={`¿Eliminar el plan ${p.name}?`}>
                          <Trash2 className="h-4 w-4" />
                        </ActionButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between border-t px-5 py-3 text-xs text-gray-600">
          <span>
            {total === 0 ? 'Sin registros' : `Mostrando de ${(page - 1) * per + 1} al ${Math.min(page * per, total)} de un total de ${total}`}
          </span>
          <div className="flex items-center gap-1">
            <PageLink href={href({ page: page - 1 })} disabled={page <= 1} label="Anterior">
              <ChevronLeft className="h-4 w-4" />
            </PageLink>
            {Array.from({ length: pages }, (_, i) => i + 1)
              .filter((i) => i === 1 || i === pages || Math.abs(i - page) <= 2)
              .map((i) => (
                <Link key={i} href={href({ page: i })} className={cn('inline-flex h-8 min-w-8 items-center justify-center rounded px-2', i === page ? 'bg-sky-500 font-semibold text-white' : 'hover:bg-gray-100')}>
                  {i}
                </Link>
              ))}
            <PageLink href={href({ page: page + 1 })} disabled={page >= pages} label="Siguiente">
              <ChevronRight className="h-4 w-4" />
            </PageLink>
          </div>
        </div>
      </div>
    </div>
  )
}

function PageLink({ href, disabled, label, children }: { href: string; disabled: boolean; label: string; children: React.ReactNode }) {
  if (disabled) return <span className="inline-flex h-8 w-8 items-center justify-center text-gray-300" aria-label={label}>{children}</span>
  return (
    <Link href={href} aria-label={label} className="inline-flex h-8 w-8 items-center justify-center rounded hover:bg-gray-100">
      {children}
    </Link>
  )
}
