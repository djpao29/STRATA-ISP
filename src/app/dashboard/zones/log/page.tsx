import Link from 'next/link'
import type { NetworkActionStatus, NetworkActionType, Prisma } from '@prisma/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/app/page-header'
import { PAGE_SIZE, Pagination, param, parsePage } from '@/components/app/list-controls'
import { ActionButton } from '@/components/forms/action-form'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { can } from '@/lib/permissions'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { manageAction } from '../actions'

export const metadata = { title: 'Registro de cortes' }

const STATUS: Record<NetworkActionStatus, [string, string]> = {
  PENDING: ['Pendiente', 'bg-amber-100 text-amber-800'],
  RUNNING: ['Ejecutando', 'bg-blue-100 text-blue-800'],
  DONE: ['Aplicada', 'bg-green-100 text-green-800'],
  FAILED: ['Fallida', 'bg-red-100 text-red-800'],
  CANCELLED: ['Cancelada', 'bg-gray-100 text-gray-700'],
}
const AUDIT_LABEL: Record<string, string> = {
  'customer.suspend_auto': 'Corte automático',
  'customer.suspend': 'Corte manual',
  'customer.reconnect_auto': 'Reconexión automática',
  'customer.reconnect': 'Reconexión manual',
  'customer.zone': 'Cambio de zona',
  'zone.create': 'Zona creada',
  'zone.update': 'Zona modificada',
  'zones.run_now': 'Ejecución manual',
}

type Props = { searchParams: Record<string, string | string[] | undefined> }

export default async function ZonesLogPage({ searchParams }: Props) {
  const user = await requireUser('zones')
  const tz = user.tenant.timezone
  const status = param(searchParams.status) as NetworkActionStatus | undefined
  const type = param(searchParams.type) as NetworkActionType | undefined
  const page = parsePage(searchParams.page)
  const canWrite = can(user.role, 'zonesWrite')

  const where: Prisma.NetworkActionWhereInput = {
    tenantId: user.tenantId,
    ...(status && STATUS[status] ? { status } : {}),
    ...(type === 'SUSPEND' || type === 'RECONNECT' ? { type } : {}),
  }

  const [actions, total, events, runs] = await Promise.all([
    prisma.networkAction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        customer: { select: { id: true, firstName: true, lastName: true } },
        router: { select: { name: true } },
        service: { select: { pppoeUser: true, ipAddress: true, mode: true } },
      },
    }),
    prisma.networkAction.count({ where }),
    prisma.auditLog.findMany({
      where: { tenantId: user.tenantId, action: { in: Object.keys(AUDIT_LABEL) } },
      orderBy: { createdAt: 'desc' },
      take: 40,
      include: { user: { select: { name: true } } },
    }),
    prisma.jobRun.findMany({ where: { tenantId: user.tenantId, job: 'zones' }, orderBy: { startedAt: 'desc' }, take: 15 }),
  ])
  const customerNames = new Map(
    (
      await prisma.customer.findMany({
        where: { id: { in: events.filter((e) => e.entity === 'Customer' && e.entityId).map((e) => e.entityId!) } },
        select: { id: true, firstName: true, lastName: true },
      })
    ).map((c) => [c.id, `${c.firstName} ${c.lastName}`])
  )

  return (
    <div className="space-y-6">
      <PageHeader title="Registro de cortes y reconexiones" description="Acciones aplicadas en los routers, reintentos y ejecuciones automáticas">
        <Button asChild variant="outline">
          <Link href="/dashboard/zones">Volver a zonas</Link>
        </Button>
      </PageHeader>

      <form className="flex flex-col gap-2 sm:flex-row">
        <select name="status" defaultValue={status ?? ''} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
          <option value="">Todos los estados</option>
          {Object.entries(STATUS).map(([k, [l]]) => (
            <option key={k} value={k}>{l}</option>
          ))}
        </select>
        <select name="type" defaultValue={type ?? ''} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
          <option value="">Cortes y reconexiones</option>
          <option value="SUSPEND">Solo cortes</option>
          <option value="RECONNECT">Solo reconexiones</option>
        </select>
        <Button type="submit" variant="secondary">Filtrar</Button>
      </form>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Acciones en routers</CardTitle>
        </CardHeader>
        <CardContent>
          {actions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin acciones registradas.</p>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Cliente</th>
                    <th>Acción</th>
                    <th>Router / método</th>
                    <th>Estado</th>
                    <th>Intentos</th>
                    <th>Detalle</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {actions.map((a) => (
                    <tr key={a.id}>
                      <td>{formatDateTime(a.createdAt, tz)}</td>
                      <td>
                        <Link href={`/dashboard/customers/${a.customer.id}`} className="text-blue-700 hover:underline">
                          {a.customer.firstName} {a.customer.lastName}
                        </Link>
                        <div className="text-xs text-muted-foreground">{a.service.pppoeUser ?? a.service.ipAddress ?? '—'}</div>
                      </td>
                      <td>
                        {a.type === 'SUSPEND' ? 'Corte' : 'Reconexión'}
                        <div className="text-xs text-muted-foreground">{a.source === 'AUTO' ? 'Automática' : 'Manual'}</div>
                      </td>
                      <td>
                        {a.router?.name ?? '—'}
                        <div className="text-xs text-muted-foreground">{a.method === 'ppp_secret' ? 'Usuario PPPoE' : a.method === 'address_list' ? 'Address-list' : ''}</div>
                      </td>
                      <td>
                        <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', STATUS[a.status][1])}>{STATUS[a.status][0]}</span>
                        {a.status === 'PENDING' && a.attempts > 0 && (
                          <div className="text-xs text-muted-foreground">reintento {formatDateTime(a.nextAttemptAt, tz)}</div>
                        )}
                      </td>
                      <td>{a.attempts}</td>
                      <td className="max-w-xs whitespace-normal text-xs">
                        {a.reason}
                        {a.lastError && <div className="text-red-600">{a.lastError}</div>}
                        {a.finishedAt && <div className="text-muted-foreground">Terminó {formatDateTime(a.finishedAt, tz)}</div>}
                      </td>
                      <td className="space-x-1 whitespace-nowrap text-right">
                        {canWrite && (a.status === 'FAILED' || a.status === 'PENDING') && (
                          <>
                            <ActionButton action={manageAction} fields={{ id: a.id, op: 'retry' }} variant="outline" size="sm">
                              Reintentar ahora
                            </ActionButton>
                            <ActionButton action={manageAction} fields={{ id: a.id, op: 'cancel' }} variant="ghost" size="sm" confirm="¿Cancelar esta acción? No se aplicará en el router.">
                              Cancelar
                            </ActionButton>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-3">
            <Pagination page={page} total={total} basePath="/dashboard/zones/log" params={{ status, type }} />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Eventos</CardTitle>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin eventos.</p>
            ) : (
              <ul className="divide-y text-sm">
                {events.map((e) => {
                  const d = (e.details ?? {}) as Record<string, unknown>
                  return (
                    <li key={e.id} className="py-2">
                      <div className="flex justify-between gap-2">
                        <span className="font-medium">{AUDIT_LABEL[e.action]}</span>
                        <span className="text-xs text-muted-foreground">{formatDateTime(e.createdAt, tz)}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {e.entity === 'Customer' && e.entityId && (
                          <Link href={`/dashboard/customers/${e.entityId}`} className="text-blue-700 hover:underline">
                            {customerNames.get(e.entityId) ?? 'Cliente'}
                          </Link>
                        )}
                        {typeof d.reason === 'string' && ` · ${d.reason}`}
                        {typeof d.fromName !== 'undefined' && ` · ${String(d.fromName ?? 'Sin zona')} → ${String(d.toName ?? 'Sin zona')}`}
                        {e.user ? ` · por ${e.user.name}` : ' · sistema'}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ejecuciones automáticas recientes</CardTitle>
          </CardHeader>
          <CardContent>
            {runs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aún no hay ejecuciones.</p>
            ) : (
              <ul className="divide-y text-sm">
                {runs.map((r) => {
                  const s = (r.summary ?? {}) as {
                    billing?: Array<{ zone: string; cycle: string; created: number; errors: number }>
                    suspensions?: { suspended: number }
                    reconnections?: { reconnected: number }
                    error?: string
                  }
                  return (
                    <li key={r.id} className="py-2">
                      <div className="flex justify-between gap-2">
                        <span className={r.ok ? 'font-medium' : 'font-medium text-red-600'}>{r.ok ? 'Correcta' : 'Con errores'}</span>
                        <span className="text-xs text-muted-foreground">{formatDateTime(r.startedAt, tz)}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {(s.billing ?? []).map((b) => `${b.zone} (ciclo ${b.cycle}): ${b.created} facturas`).join(' · ') || 'Sin zonas con facturación automática'}
                        {` · ${s.suspensions?.suspended ?? 0} cortes · ${s.reconnections?.reconnected ?? 0} reconexiones`}
                        {s.error && <div className="text-red-600">{s.error}</div>}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
