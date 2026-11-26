import Link from 'next/link'
import { AlertTriangle, CalendarCheck, ClipboardList, Coins, HeartHandshake, TrendingUp, Wallet } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { GradientCard, KpiCard, BigValue } from '@/components/dashboard/home/cards'
import { Breakdown, DailyCollectionsChart } from '@/components/dashboard/home/finance-charts'
import { requireUser } from '@/lib/session'
import { formatCurrency, formatDate } from '@/lib/format'
import { collectionsDashboard } from '@/lib/collections'

export const metadata = { title: 'Dashboard de cobros' }

export default async function CollectionsDashboardPage() {
  const user = await requireUser('finance')
  const c = user.tenant.currency
  const d = await collectionsDashboard(user.tenantId, user.tenant.timezone)
  const fmt = (v: number) => formatCurrency(v, c)

  return (
    <div className="space-y-5">
      <PageHeader title="Dashboard de cobros" description="Cobranza del mes, deuda por antigüedad y pendientes de gestión" />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <GradientCard title="Cobrado hoy" icon={Coins} color="green" value={fmt(d.today.amount)} caption={`${d.today.count} pago(s)`} href="/dashboard/payments" />
        <GradientCard title="Últimos 7 días" icon={CalendarCheck} color="blue" value={fmt(d.week.amount)} caption={`${d.week.count} pago(s)`} href="/dashboard/payments" />
        <GradientCard title="Cobrado este mes" icon={TrendingUp} color="orange" value={fmt(d.month.amount)} caption={`${d.month.count} pago(s) · facturado ${fmt(d.invoicedMonth)}`} href="/dashboard/finance/accounting">
          <div className="h-1.5 rounded-full bg-white/30">
            <div className="h-1.5 rounded-full bg-white" style={{ width: `${Math.min(100, d.recovery ?? 0)}%` }} />
          </div>
          <div className="mt-1.5 text-xs font-semibold">{d.recovery === null ? 'Sin facturas este mes' : `${d.recovery}% de recuperación del mes`}</div>
        </GradientCard>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard title="Por cobrar" icon={Wallet} color="amber" href="/dashboard/finance/pending">
          <BigValue value={fmt(d.receivable)} caption={`${d.debtors} cliente(s) con saldo`} />
        </KpiCard>
        <KpiCard title="Vencido" icon={AlertTriangle} color="red" href="/dashboard/finance/pending?aging=D1_30">
          <BigValue value={fmt(d.overdue)} caption="Pasado el límite de pago" />
        </KpiCard>
        <KpiCard title="Reportes por revisar" icon={ClipboardList} color="indigo" href="/dashboard/finance/payment-reports">
          <BigValue value={d.reportsToReview} caption={d.reportsToReview ? 'Pagos informados por clientes' : 'Sin reportes pendientes'} />
        </KpiCard>
        <KpiCard title="Promesas próximas" icon={HeartHandshake} color="cyan" href="/dashboard/finance/promises?status=ACTIVE">
          <BigValue value={d.promisesDue.length} caption="Vencen en los próximos 7 días" />
        </KpiCard>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cobros por día (mes en curso)</CardTitle>
        </CardHeader>
        <CardContent>
          <DailyCollectionsChart data={d.daily} currency={c} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Por forma de pago (mes)</CardTitle>
          </CardHeader>
          <CardContent>
            <Breakdown rows={d.byAccount} currency={c} color="bg-green-500" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Por usuario que cobró (mes)</CardTitle>
          </CardHeader>
          <CardContent>
            <Breakdown rows={d.byUser} currency={c} color="bg-blue-500" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Por zona (mes)</CardTitle>
          </CardHeader>
          <CardContent>
            <Breakdown rows={d.byZone} currency={c} color="bg-purple-500" />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Antigüedad de la deuda</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <tbody className="divide-y">
                {d.aging.map((a) => (
                  <tr key={a.bucket}>
                    <td className="py-2">
                      <Link href={`/dashboard/finance/pending?aging=${a.bucket}`} className="hover:underline">{a.label}</Link>
                    </td>
                    <td className="py-2 text-right text-muted-foreground">{a.customers} cliente(s)</td>
                    <td className="py-2 text-right font-semibold">{fmt(a.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mayores saldos</CardTitle>
          </CardHeader>
          <CardContent>
            {d.topDebtors.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nadie debe. Todos al día.</p>
            ) : (
              <ul className="divide-y text-sm">
                {d.topDebtors.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2 py-2">
                    <Link href={`/dashboard/customers/${t.id}`} className="truncate text-blue-700 hover:underline">{t.name}</Link>
                    <span className="whitespace-nowrap">
                      <span className="text-xs text-muted-foreground">{t.daysLate > 0 ? `${t.daysLate} días · ` : ''}</span>
                      <strong>{fmt(t.balance)}</strong>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {d.promisesDue.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Promesas que vencen pronto</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {d.promisesDue.map((p) => (
                <li key={p.id} className="flex justify-between gap-2 py-2">
                  <Link href={`/dashboard/customers/${p.customer.id}`} className="text-blue-700 hover:underline">
                    {p.customer.firstName} {p.customer.lastName}
                  </Link>
                  <span>
                    hasta {formatDate(p.promisedDate)}
                    {p.amount ? ` · ${fmt(Number(p.amount))}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
