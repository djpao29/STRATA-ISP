import Link from 'next/link'
import {
  Activity,
  ArrowUpRight,
  CalendarDays,
  ClipboardList,
  CreditCard,
  DollarSign,
  LifeBuoy,
  Package,
  Router as RouterIcon,
  Scissors,
  Sparkles,
  TrendingUp,
  UserPlus,
  Users,
} from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { StatusBadge } from '@/components/app/status-badge'
import { BigValue, DarkPanel, GradientCard, KpiCard, ProgressRow } from '@/components/dashboard/home/cards'
import { CollectionsChart, GrowthChart, MonthsSelect } from '@/components/dashboard/home/charts'
import { requireUser } from '@/lib/session'
import { can } from '@/lib/permissions'
import { dashboardData } from '@/lib/dashboard'
import { formatCurrency, formatDateTime } from '@/lib/format'
import { formatCustomerCode } from '@/lib/zones/billing'

export const metadata = { title: 'Dashboard' }

/** Descripción legible de cada evento del registro de actividad. */
const ACTIVITY: Record<string, string> = {
  'customer.create': 'Cliente creado',
  'customer.update': 'Cliente actualizado',
  'customer.status': 'Estado de cliente cambiado',
  'customer.zone': 'Cambio de zona',
  'customer.delete': 'Cliente eliminado',
  'customer.suspend': 'Corte manual',
  'customer.suspend_auto': 'Corte automático por falta de pago',
  'customer.reconnect': 'Reconexión manual',
  'customer.reconnect_auto': 'Reconexión automática',
  'service.create': 'Servicio asignado',
  'service.toggle': 'Servicio activado/desactivado',
  'service.delete': 'Servicio eliminado',
  'invoice.create': 'Factura creada',
  'invoice.generate': 'Facturación del ciclo',
  'invoice.cancel': 'Factura anulada',
  'payment.create': 'Pago registrado',
  'payment.approved': 'Pago aprobado',
  'payment.rejected': 'Pago rechazado',
  'plan.create': 'Plan creado',
  'plan.update': 'Plan modificado',
  'plan.toggle': 'Plan activado/desactivado',
  'plan.delete': 'Plan eliminado',
  'router.create': 'Router registrado',
  'router.update': 'Router modificado',
  'router.delete': 'Router eliminado',
  'ticket.create': 'Ticket abierto',
  'ticket.update': 'Ticket actualizado',
  'zone.create': 'Zona creada',
  'zone.update': 'Zona modificada',
  'zones.run_now': 'Facturación y cortes ejecutados',
  'user.create': 'Usuario creado',
  'user.access': 'Permisos de usuario cambiados',
  'user.password_change': 'Contraseña cambiada',
  'user.password_reset': 'Contraseña restablecida',
  'tenant.update': 'Datos de la empresa actualizados',
  'monitoring.settings': 'Ajustes de monitoreo',
  'monitoring.interface': 'Interfaz configurada',
  'whatsapp.config': 'WhatsApp configurado',
  'olt.create': 'OLT registrada',
  'onu.create': 'ONU registrada',
}

type Props = { searchParams: Record<string, string | string[] | undefined> }

export default async function DashboardPage({ searchParams }: Props) {
  const user = await requireUser('dashboard')
  const tz = user.tenant.timezone
  const currency = user.tenant.currency
  const months = searchParams.months === '6' ? 6 : 12
  const seesMoney = can(user.role, 'billing')
  const d = await dashboardData(user.tenantId, tz, { months, withMoney: seesMoney })
  const money = d.money
  const totalGrowth = d.growth.reduce((s, g) => s + g.altas, 0)
  const ticketsTotal = d.openTickets + d.resolvedTickets

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Estado actual de tu red · {user.tenant.name}</p>
      </div>

      {/* Fila 1: tarjetas pequeñas */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 2xl:grid-cols-7">
        <KpiCard title="Clientes totales" icon={Users} color="blue" href="/dashboard/customers">
          <BigValue value={d.totalCustomers} />
          <ProgressRow label="Activos" value={d.activeCustomers} total={d.totalCustomers} color="bg-green-500" labelClass="text-green-700" />
          <ProgressRow label="Suspendidos" value={d.suspendedCustomers} total={d.totalCustomers} color="bg-orange-500" labelClass="text-orange-600" />
        </KpiCard>

        {can(user.role, 'customersWrite') ? (
          <KpiCard title="Nuevo cliente" icon={UserPlus} color="teal" href="/dashboard/customers/new">
            <BigValue value="Crear" caption="Registrar un abonado" />
          </KpiCard>
        ) : (
          <KpiCard title="Clientes" icon={UserPlus} color="teal" href="/dashboard/customers">
            <BigValue value="Ver" caption="Lista de abonados" />
          </KpiCard>
        )}

        <KpiCard title="Routers" icon={RouterIcon} color="purple" href={can(user.role, 'monitoring') ? '/dashboard/monitoring' : undefined}>
          <BigValue value={d.routersOnline} caption={`Conectados de ${d.routersTotal}`} />
        </KpiCard>

        <KpiCard title="Planes" icon={Package} color="green" href={can(user.role, 'plans') ? '/dashboard/plans' : undefined}>
          <BigValue value={d.plans} caption="Disponibles" />
        </KpiCard>

        <KpiCard title="Reporte de pagos" icon={ClipboardList} color="amber" href={can(user.role, 'payments') ? '/dashboard/payments?status=PENDING' : undefined}>
          <BigValue value={d.pendingPayments} caption={d.pendingPayments ? 'Pagos por revisar' : 'Sin reportes por revisar'} />
        </KpiCard>

        <KpiCard title="Cortes pendientes" icon={Scissors} color={d.failedCuts ? 'red' : 'indigo'} href={can(user.role, 'zones') ? '/dashboard/zones/log' : undefined}>
          <BigValue
            value={d.pendingCuts + d.failedCuts}
            caption={d.failedCuts ? `${d.failedCuts} con error en el router` : d.pendingCuts ? 'Por aplicar en los routers' : 'Sin cortes por aplicar'}
          />
        </KpiCard>

        <KpiCard title="Tickets" icon={LifeBuoy} color="cyan" href="/dashboard/support">
          <BigValue
            value={d.openTickets}
            caption={ticketsTotal === 0 ? 'Sin tickets abiertos ni resueltos' : `Abiertos · ${d.resolvedTickets} resueltos`}
          />
          <div className="mt-1 text-xs font-medium text-cyan-700">{d.openTickets === 0 ? 'Al día' : `${d.openTickets} por atender`}</div>
          <div className="mt-1 h-1.5 rounded-full bg-gray-100">
            <div
              className="h-1.5 rounded-full bg-emerald-500"
              style={{ width: `${ticketsTotal ? Math.round((d.resolvedTickets / ticketsTotal) * 100) : 100}%` }}
            />
          </div>
        </KpiCard>
      </div>

      {/* Fila 2: dinero */}
      {money && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <GradientCard
            title="Pagos hoy"
            icon={DollarSign}
            color="green"
            value={formatCurrency(money.paidToday, currency)}
            caption={money.paidTodayCount ? `${money.paidTodayCount} cobro(s) hoy` : 'Sin cobros hoy'}
            href="/dashboard/payments"
          />
          <GradientCard
            title="Por cobrar"
            icon={CreditCard}
            color="orange"
            value={formatCurrency(money.pendingTotal, currency)}
            caption={`${money.pendingCount} factura(s) pendiente(s)`}
            href="/dashboard/billing?status=PENDING"
          >
            <div className="h-1.5 rounded-full bg-white/30">
              <div className="h-1.5 rounded-full bg-white" style={{ width: `${money.collectedPct}%` }} />
            </div>
            <div className="mt-1.5 text-xs font-semibold">
              {money.collectedPct}% cobrado · {100 - money.collectedPct}% por cobrar
            </div>
          </GradientCard>
          <GradientCard
            title="Ingresos del mes"
            icon={TrendingUp}
            color="blue"
            value={formatCurrency(money.monthCollected, currency)}
            caption={`Total recaudado · ${money.monthPaymentsCount} pago(s)`}
            href="/dashboard/reports"
          />
        </div>
      )}

      {/* Fila 3: gráficos */}
      <div className={`grid grid-cols-1 gap-3 ${money ? 'xl:grid-cols-2' : ''}`}>
        {money && (
          <DarkPanel
            title={`Cobros últimos ${months} meses`}
            actions={
              <>
                <MonthsSelect value={months} />
                <Link href="/dashboard/reports" className="inline-flex items-center gap-1 text-xs font-semibold text-sky-400 hover:underline">
                  Ver estadísticas <ArrowUpRight className="h-3 w-3" />
                </Link>
              </>
            }
          >
            <CollectionsChart data={money.revenue} currency={currency} />
          </DarkPanel>
        )}

        <DarkPanel
          title="Crecimiento de clientes"
          actions={
            <>
              <span className="rounded border border-slate-600 px-2 py-0.5 text-xs">Total {d.totalCustomers}</span>
              {!money && <MonthsSelect value={months} />}
              <Link href="/dashboard/customers" className="inline-flex items-center gap-1 text-xs font-semibold text-sky-400 hover:underline">
                Ver clientes <ArrowUpRight className="h-3 w-3" />
              </Link>
            </>
          }
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_9rem]">
            <div>
              <GrowthChart data={d.growth} />
              <p className="mt-1 text-[11px] text-slate-400">{totalGrowth} alta(s) en los últimos {months} meses</p>
            </div>
            <div className="rounded-md border border-slate-700 bg-slate-900/60 p-2">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Instalaciones</div>
              <div className="mb-2 rounded border border-teal-700/60 bg-teal-900/30 p-2">
                <div className="flex items-center gap-1 text-[11px] text-teal-300">
                  <Sparkles className="h-3 w-3" /> Hoy
                </div>
                <div className="text-xl font-bold">{d.newToday}</div>
                <div className="text-[10px] text-slate-400">altas</div>
              </div>
              <div className="rounded border border-slate-700 p-2">
                <div className="flex items-center gap-1 text-[11px] text-slate-300">
                  <CalendarDays className="h-3 w-3" /> {d.growth.at(-1)?.month}
                </div>
                <div className="text-xl font-bold">{d.newThisMonth}</div>
                <div className="text-[10px] text-slate-400">este mes</div>
              </div>
            </div>
          </div>
        </DarkPanel>
      </div>

      {/* Fila 4: listas */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <div className="flex flex-col rounded-lg border bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b px-5 py-4">
            <UserPlus className="h-4 w-4 text-blue-600" />
            <h2 className="font-semibold">Clientes recientes</h2>
          </div>
          <div className="flex-1 px-5 py-3">
            {d.recentCustomers.length === 0 ? (
              <p className="py-10 text-center text-sm italic text-muted-foreground">No hay clientes registrados aún.</p>
            ) : (
              <ul className="divide-y">
                {d.recentCustomers.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarFallback className="text-xs">{`${c.firstName[0] ?? ''}${c.lastName[0] ?? ''}`.toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <Link href={`/dashboard/customers/${c.id}`} className="block truncate text-sm font-medium text-blue-700 hover:underline">
                          {c.firstName} {c.lastName}
                        </Link>
                        <div className="truncate text-xs text-muted-foreground">
                          {formatCustomerCode(c.code)} · {c.zone?.name ?? 'Sin zona'} · {c.services.map((s) => s.plan.name).join(', ') || 'Sin plan'}
                        </div>
                      </div>
                    </div>
                    <StatusBadge value={c.status} />
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="px-5 pb-4">
            <Link href="/dashboard/customers" className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:underline">
              Ver todos los clientes <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        <div className="flex flex-col rounded-lg border bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b px-5 py-4">
            <Activity className="h-4 w-4 text-blue-600" />
            <h2 className="font-semibold">Actividades recientes</h2>
          </div>
          <div className="flex-1 px-5 py-3">
            {d.activity.length === 0 ? (
              <p className="py-10 text-center text-sm italic text-muted-foreground">Sin actividad reciente en los últimos 14 días.</p>
            ) : (
              <ul className="divide-y">
                {d.activity.map((a) => (
                  <li key={a.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium">{ACTIVITY[a.action] ?? a.action}</div>
                      <div className="text-xs text-muted-foreground">{a.user ? `por ${a.user.name}` : 'automático (sistema)'}</div>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(a.createdAt, tz)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {can(user.role, 'settings') && (
            <div className="px-5 pb-4">
              <Link href="/dashboard/settings" className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:underline">
                Ver todo el registro <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
