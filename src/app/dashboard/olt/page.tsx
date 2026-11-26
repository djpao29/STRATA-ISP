import Link from 'next/link'
import type { PonEventKind } from '@prisma/client'
import {
  Activity,
  AlertTriangle,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Cloud,
  Globe,
  Info,
  List,
  PackagePlus,
  Radio,
  RefreshCw,
  Server,
  SignalLow,
  WifiOff,
  XCircle,
  Zap,
} from 'lucide-react'
import { ActionButton } from '@/components/forms/action-form'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { formatDateTime } from '@/lib/format'
import { localInputToInstant, monthStartIn, todayIn } from '@/lib/dates'
import { EVENT_LABEL } from '@/lib/olt/labels'
import { getOltSettings } from '@/lib/olt/service'
import { cn } from '@/lib/utils'
import { pollNow } from './actions'
import { AuthorizedChart } from './charts'
import { AutoRefresh } from './forms'
import { BRAND_LABEL, fmtUptime } from './shared'

export const metadata = { title: 'Dashboard OLT' }
export const dynamic = 'force-dynamic'

const EVENT_ICON: Record<PonEventKind, typeof Activity> = {
  SIGNAL_VARIATION: Activity,
  POWER_OFF: Zap,
  LOS: AlertTriangle,
  PON_DOWN: AlertTriangle,
  OFFLINE: WifiOff,
}
const EVENT_ORDER: PonEventKind[] = ['SIGNAL_VARIATION', 'POWER_OFF', 'LOS', 'PON_DOWN', 'OFFLINE']
const MONTHS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEPT', 'OCT', 'NOV', 'DIC']

function Stat({ value, label, icon: Icon, color }: { value: number; label: string; icon: typeof Cloud; color: string }) {
  return (
    <div className="flex items-center justify-between border-b px-4 py-3 last:border-b-0">
      <div>
        <div className={cn('text-2xl font-light', color)}>{value}</div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</div>
      </div>
      <Icon className={cn('h-7 w-7 opacity-30', color)} />
    </div>
  )
}

function Panel({ title, icon: Icon, children, right }: { title: string; icon: typeof Cloud; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-gray-700">
          <Icon className="h-3.5 w-3.5" />
          {title}
        </h2>
        {right}
      </div>
      {children}
    </div>
  )
}

export default async function OltDashboardPage() {
  const user = await requireUser('olt')
  const tenantId = user.tenantId
  const tz = user.tenant.timezone
  const settings = await getOltSettings(tenantId)
  const today = todayIn(tz)
  const monthStart = monthStartIn(tz)
  const yearStart = new Date(Date.UTC(today.getUTCFullYear(), 0, 1))
  // Las fechas guardadas son instantes; "hoy" local empieza a la medianoche local.
  const localStart = (d: Date) => localInputToInstant(`${d.toISOString().slice(0, 10)}T00:00`, tz)
  const monthOf = new Intl.DateTimeFormat('en-CA', { timeZone: tz, month: 'numeric' })
  const onuWhere = { olt: { tenantId } }

  const [inSystem, inOlt, unauthorized, authToday, authMonth, authTotal, active, powerOff, los, lowSignal, openEvents, olts, recent, yearly, lastPoll] = await Promise.all([
    prisma.oNU.count({ where: { ...onuWhere, customerId: { not: null } } }),
    prisma.oNU.count({ where: { ...onuWhere, inOlt: true } }),
    prisma.onuDiscovery.count({ where: { olt: { tenantId }, active: true } }),
    prisma.oNU.count({ where: { ...onuWhere, authorizedAt: { gte: localStart(today) } } }),
    prisma.oNU.count({ where: { ...onuWhere, authorizedAt: { gte: localStart(monthStart) } } }),
    prisma.oNU.count({ where: { ...onuWhere, authState: 'AUTHORIZED' } }),
    prisma.oNU.count({ where: { ...onuWhere, inOlt: true, status: 'ACTIVE' } }),
    prisma.oNU.count({ where: { ...onuWhere, inOlt: true, status: 'POWER_OFF' } }),
    prisma.oNU.count({ where: { ...onuWhere, inOlt: true, status: { in: ['LOS', 'OFFLINE'] } } }),
    prisma.oNU.count({ where: { ...onuWhere, inOlt: true, status: 'ACTIVE', rxPower: { lte: settings.lowSignal } } }),
    prisma.ponEvent.findMany({ where: { tenantId, resolvedAt: null }, orderBy: { createdAt: 'desc' }, take: 300, include: { olt: { select: { name: true } } } }),
    prisma.oLT.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { onus: { where: { authState: 'AUTHORIZED' } } } } },
    }),
    prisma.auditLog.findMany({
      where: { tenantId, OR: [{ action: { startsWith: 'onu.' } }, { action: { startsWith: 'olt.' } }] },
      orderBy: { createdAt: 'desc' },
      take: 6,
      include: { user: { select: { name: true } } },
    }),
    prisma.oNU.findMany({ where: { ...onuWhere, authorizedAt: { gte: localStart(yearStart) } }, select: { authorizedAt: true } }),
    prisma.oLT.findFirst({ where: { tenantId, lastPollAt: { not: null } }, orderBy: { lastPollAt: 'desc' }, select: { lastPollAt: true } }),
  ])

  const chart = MONTHS.map((month, i) => ({
    month,
    total: yearly.filter((o) => o.authorizedAt && Number(monthOf.format(o.authorizedAt)) === i + 1).length,
  }))
  const byKind = (k: PonEventKind) => openEvents.filter((e) => e.kind === k)
  const allOk = openEvents.length === 0
  const monthName = new Intl.DateTimeFormat('es-DO', { month: 'long', timeZone: tz }).format(new Date())

  return (
    <div className="space-y-4">
      <AutoRefresh seconds={30} />
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard OLT</h1>
        <p className="text-sm text-gray-500">
          Resumen GPON ·{' '}
          <Link href="/dashboard/olt/list" className="text-blue-700 hover:underline">
            Lista de OLT
          </Link>{' '}
          ·{' '}
          <Link href="/dashboard/olt/onus" className="text-blue-700 hover:underline">
            ONUs autorizadas
          </Link>
        </p>
        <p className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-green-700">
          <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" /> EN VIVO
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="ONU's" icon={CheckCircle2}>
          <Stat value={inSystem} label="En sistema" icon={Cloud} color="text-emerald-600" />
          <Stat value={inOlt} label="En OLT" icon={Server} color="text-sky-600" />
          <Link href="/dashboard/olt/onus/unauthorized" className="block hover:bg-gray-50">
            <Stat value={unauthorized} label="Sin autorizar" icon={XCircle} color="text-orange-500" />
          </Link>
        </Panel>
        <Panel title="ONU's autorizadas" icon={List}>
          <Stat value={authToday} label="Hoy" icon={CalendarDays} color="text-sky-600" />
          <Stat value={authMonth} label={monthName} icon={CalendarDays} color="text-sky-600" />
          <Stat value={authTotal} label="Total" icon={PackagePlus} color="text-gray-700" />
        </Panel>
        <Panel
          title="Estado ONU's"
          icon={Radio}
          right={
            <Link href="/dashboard/olt/alerts" className="flex items-center gap-1 text-[10px] font-semibold uppercase text-violet-600 hover:underline">
              <Bell className="h-3 w-3" /> Alertas
            </Link>
          }
        >
          <Stat value={active} label="Activas" icon={Globe} color="text-emerald-600" />
          <Stat value={powerOff} label="Sin energía" icon={Zap} color="text-orange-500" />
          <Stat value={los} label="Fuera de línea" icon={WifiOff} color="text-red-500" />
          <Link href="/dashboard/olt/health" className="block hover:bg-gray-50">
            <Stat value={lowSignal} label="Baja señal" icon={SignalLow} color="text-amber-500" />
          </Link>
        </Panel>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
        Última actualización: {lastPoll?.lastPollAt ? formatDateTime(lastPoll.lastPollAt, tz) : '—'} <span className="text-[10px]">(hora local)</span>
        <span>|</span>
        <ActionButton action={pollNow} variant="ghost" size="sm" className="h-7 px-2 text-xs text-sky-700">
          <RefreshCw className="mr-1 h-3 w-3" /> Actualizar ahora
        </ActionButton>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
          <div className="flex items-center gap-2 bg-slate-700 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-white">
            <Activity className="h-3.5 w-3.5" /> Eventos PON
            <span className={cn('rounded px-1.5 py-0.5 text-[10px]', allOk ? 'bg-green-500' : 'bg-red-500')}>{allOk ? 'OK' : openEvents.length}</span>
          </div>
          {EVENT_ORDER.map((k) => {
            const list = byKind(k)
            const Icon = EVENT_ICON[k]
            return (
              <details key={k} className="group border-b last:border-b-0">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-sm">
                  <ChevronRight className="h-3.5 w-3.5 text-gray-400 transition-transform group-open:rotate-90" />
                  <Icon className={cn('h-4 w-4', k === 'PON_DOWN' ? 'text-red-500' : k === 'LOS' ? 'text-amber-500' : k === 'POWER_OFF' ? 'text-sky-500' : 'text-violet-500')} />
                  <span className="flex-1 font-medium">{EVENT_LABEL[k]}</span>
                  {list.length ? (
                    <span className="rounded bg-red-100 px-1.5 text-xs font-semibold text-red-700">{list.length}</span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-green-600">
                      <CheckCircle2 className="h-3.5 w-3.5" /> OK
                    </span>
                  )}
                </summary>
                <div className="space-y-1 bg-gray-50 px-10 py-2 text-xs">
                  {list.length === 0 ? (
                    <p className="text-muted-foreground">Sin eventos abiertos.</p>
                  ) : (
                    list.slice(0, 20).map((e) => (
                      <p key={e.id}>
                        <span className="text-muted-foreground">{formatDateTime(e.createdAt, tz)} · {e.olt.name}:</span> {e.message}
                      </p>
                    ))
                  )}
                  {list.length > 20 && (
                    <Link href="/dashboard/olt/alerts" className="text-blue-700 hover:underline">
                      Ver los {list.length}
                    </Link>
                  )}
                </div>
              </details>
            )
          })}
        </div>

        <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
          <div className="flex items-center gap-2 bg-slate-700 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-white">
            <Info className="h-3.5 w-3.5" /> Info
          </div>
          <div className="space-y-2 p-4">
            {recent.length === 0 ? (
              <p className="py-2 text-center text-xs text-muted-foreground">Sin actividad reciente.</p>
            ) : (
              recent.map((r) => {
                const d = (r.details ?? {}) as { serial?: string; error?: string }
                return (
                  <p key={r.id} className="text-xs">
                    <span className="text-muted-foreground">{formatDateTime(r.createdAt, tz)}</span> · {ACTION_LABEL[r.action] ?? r.action}
                    {d.serial ? ` ${d.serial}` : ''}
                    {d.error ? <span className="text-red-700"> — {d.error}</span> : ''}
                    {r.user ? <span className="text-muted-foreground"> · {r.user.name}</span> : ''}
                  </p>
                )
              })
            )}
            <Link href="/dashboard/olt/reports" className="block rounded bg-slate-800 py-1.5 text-center text-xs font-semibold text-white hover:bg-slate-900">
              Ver toda la info
            </Link>
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-white shadow-sm">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-gray-700">ONU&apos;s autorizadas en el sistema ({today.getUTCFullYear()})</h2>
          <span className="flex items-center gap-1 text-[10px] text-gray-500">
            <span className="h-2 w-2 bg-emerald-500" /> ONU&apos;s
          </span>
        </div>
        <div className="p-4">
          <AuthorizedChart data={chart} />
          <Link href="/dashboard/olt/onus" className="mt-2 block text-right text-xs font-medium text-sky-700 hover:underline">
            Ver listado completo →
          </Link>
        </div>
      </div>

      <div className="rounded-lg border bg-white shadow-sm">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <List className="h-4 w-4" /> Lista de OLT&apos;s
          </h2>
          <Link href="/dashboard/olt/list" className="rounded border px-2.5 py-1 text-xs hover:bg-gray-50">
            Ver lista completa
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-gray-500">
              <tr>
                <th className="px-4 py-2">OLT</th>
                <th>Nombre</th>
                <th>Host</th>
                <th>ONU&apos;s autorizadas</th>
                <th>Estado</th>
                <th>Temperatura</th>
                <th>Tiempo encendida</th>
                <th className="px-4 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {olts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-4 text-center">
                    No hay OLT registradas.{' '}
                    <Link href="/dashboard/olt/list" className="text-blue-700 hover:underline">
                      Agregar OLT
                    </Link>
                  </td>
                </tr>
              ) : (
                olts.map((o) => (
                  <tr key={o.id}>
                    <td className="px-4 py-2">{BRAND_LABEL[o.brand]}{o.vendor ? ` ${o.vendor}` : ''}</td>
                    <td>
                      <Link href={`/dashboard/olt/${o.id}`} className="font-medium text-blue-700 hover:underline">
                        {o.name}
                      </Link>
                    </td>
                    <td className="font-mono text-xs">{o.host}</td>
                    <td>{o._count.onus}</td>
                    <td>
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', o.status === 'ONLINE' ? 'bg-green-100 text-green-800' : o.status === 'OFFLINE' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-700')}>
                        {o.status === 'ONLINE' ? 'En línea' : o.status === 'OFFLINE' ? 'Sin respuesta' : 'Sin leer'}
                      </span>
                      {o.lastError && <div className="max-w-xs truncate text-[10px] text-red-600" title={o.lastError}>{o.lastError}</div>}
                    </td>
                    <td>{o.temperature != null ? `${o.temperature} °C` : '—'}</td>
                    <td>{fmtUptime(o.uptimeSec)}</td>
                    <td className="px-4 text-right">
                      <ActionButton action={pollNow} fields={{ id: o.id }} variant="outline" size="sm" className="h-7 text-xs">
                        Leer
                      </ActionButton>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="border-t px-4 py-2 text-xs text-gray-500">
          Mostrando registros del 1 al {olts.length} de un total de {olts.length} registros
        </p>
      </div>
    </div>
  )
}

const ACTION_LABEL: Record<string, string> = {
  'onu.authorize': 'ONU autorizada',
  'onu.authorize_failed': 'Falló la autorización de',
  'onu.preauthorize': 'ONU pre-autorizada',
  'onu.delete': 'ONU quitada del sistema',
  'onu.update': 'ONU actualizada',
  'olt.create': 'OLT registrada',
  'olt.update': 'OLT actualizada',
  'olt.delete': 'OLT eliminada',
  'olt.settings': 'Alertas de OLT cambiadas',
}
