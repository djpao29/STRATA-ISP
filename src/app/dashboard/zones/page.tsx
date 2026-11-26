import Link from 'next/link'
import { AlertTriangle, ListChecks, MapPin, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { ActionButton } from '@/components/forms/action-form'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { can } from '@/lib/permissions'
import { formatDate, formatDateTime } from '@/lib/format'
import { zoneStats } from '@/lib/zones/stats'
import { runJobsNow } from './actions'

export const metadata = { title: 'Zonas' }

export default async function ZonesPage() {
  const user = await requireUser('zones')
  const tz = user.tenant.timezone
  const [zones, unassigned, lastRun, failed] = await Promise.all([
    prisma.zone.findMany({ where: { tenantId: user.tenantId }, orderBy: [{ isActive: 'desc' }, { invoiceDay: 'asc' }] }),
    prisma.customer.count({ where: { tenantId: user.tenantId, zoneId: null, status: { not: 'CANCELLED' } } }),
    prisma.jobRun.findFirst({ where: { tenantId: user.tenantId, job: 'zones' }, orderBy: { startedAt: 'desc' } }),
    prisma.networkAction.count({ where: { tenantId: user.tenantId, status: 'FAILED' } }),
  ])
  const stats = await Promise.all(zones.map((z) => zoneStats(z, tz)))
  const canWrite = can(user.role, 'zonesWrite')

  return (
    <div className="space-y-6">
      <PageHeader title="Zonas" description="Facturación y cortes automáticos por ciclo de pago">
        <Button asChild variant="outline">
          <Link href="/dashboard/zones/log">
            <ListChecks className="mr-2 h-4 w-4" />
            Registro de cortes
          </Link>
        </Button>
        {canWrite && (
          <>
            <ActionButton action={runJobsNow} variant="outline" confirm="¿Ejecutar ahora la facturación, los cortes y las reconexiones pendientes?">
              Ejecutar ahora
            </ActionButton>
            <Button asChild>
              <Link href="/dashboard/zones/new">
                <Plus className="mr-2 h-4 w-4" />
                Nueva zona
              </Link>
            </Button>
          </>
        )}
      </PageHeader>

      <p className="text-xs text-muted-foreground">
        La facturación y los cortes se ejecutan solos en el servidor cada minuto.
        {lastRun ? ` Última revisión: ${formatDateTime(lastRun.startedAt, tz)}${lastRun.ok ? '' : ' (con errores)'}.` : ' Aún no se ha ejecutado.'}
      </p>

      {unassigned > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {unassigned} cliente(s) sin zona: no se les factura ni se les corta automáticamente.{' '}
          <Link href="/dashboard/customers" className="underline">Asígnales una zona</Link>.
        </div>
      )}
      {failed > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {failed} corte(s) o reconexión(es) no se pudieron aplicar en el router.{' '}
          <Link href="/dashboard/zones/log?status=FAILED" className="underline">Revisar</Link>.
        </div>
      )}

      {zones.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">No hay zonas. Crea la primera.</CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {zones.map((z, i) => {
            const s = stats[i]
            return (
              <Card key={z.id} className={z.isActive ? '' : 'opacity-60'}>
                <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <MapPin className="h-5 w-5 text-blue-600" />
                      {z.name}
                      {!z.isActive && <span className="rounded bg-gray-100 px-1.5 text-xs font-normal">Inactiva</span>}
                    </CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Factura día {z.invoiceDay} · paga hasta el {z.dueDay} · corte el {z.suspendDay}
                      {z.suspendDay < z.dueDay ? ' del mes siguiente' : ''} · {s.currentCycle.graceDays} días de gracia
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {[z.autoInvoice ? 'Facturación automática' : 'Facturación manual', z.autoSuspend ? 'corte automático' : 'sin corte automático', z.autoReconnect ? 'reconexión automática' : 'reconexión manual'].join(' · ')}
                    </p>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <dl className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                    <Kpi label="Clientes" value={s.customers} />
                    <Kpi label="Al día" value={s.upToDate} tone="green" />
                    <Kpi label="Pendientes" value={s.pending} tone={s.pending ? 'amber' : undefined} />
                    <Kpi label="Suspendidos" value={s.suspended} tone={s.suspended ? 'red' : undefined} />
                    <Kpi label="Facturas del ciclo" value={s.invoicesGenerated} />
                    <Kpi label="Pagadas" value={s.invoicesPaid} tone="green" />
                    <Kpi label="Vencidas" value={s.invoicesOverdue} tone={s.invoicesOverdue ? 'red' : undefined} />
                    <Kpi label="Cortes pendientes" value={s.pendingCuts} tone={s.pendingCuts ? 'amber' : undefined} />
                  </dl>
                  <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                    <DateBox label="Ciclo actual" value={formatDate(s.currentCycle.cycleDate)} />
                    <DateBox label="Próxima facturación" value={formatDate(s.nextInvoiceDate)} />
                    <DateBox label="Próximo corte" value={formatDate(s.nextSuspendDate)} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild>
                      <Link href={`/dashboard/zones/${z.id}`}>Ver clientes</Link>
                    </Button>
                    {canWrite && (
                      <Button asChild variant="outline">
                        <Link href={`/dashboard/zones/${z.id}/edit`}>Configurar</Link>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: 'green' | 'amber' | 'red' }) {
  const color = tone === 'green' ? 'text-green-700' : tone === 'amber' ? 'text-amber-700' : tone === 'red' ? 'text-red-600' : 'text-gray-900'
  return (
    <div className="rounded-md bg-gray-50 px-2 py-2">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className={`text-xl font-bold ${color}`}>{value}</dd>
    </div>
  )
}

function DateBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  )
}
