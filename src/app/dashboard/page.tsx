import Link from 'next/link'
import { AlertTriangle, CreditCard, Ticket, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/app/page-header'
import { DataTable } from '@/components/app/data-table'
import { StatusBadge } from '@/components/app/status-badge'
import { StatCard, StatGrid } from '@/components/app/stat-card'
import { RevenueChart } from '@/components/dashboard/revenue-chart'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { can } from '@/lib/permissions'
import { markOverdueInvoices } from '@/lib/billing'
import { monthlyRevenue } from '@/lib/reports'
import { formatCurrency, formatDay, formatNumber } from '@/lib/format'
import { monthStartIn } from '@/lib/dates'

export const metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const user = await requireUser('dashboard')
  const t = user.tenantId
  const currency = user.tenant.currency
  const seesMoney = can(user.role, 'billing')
  if (seesMoney) await markOverdueInvoices(t)

  const monthStart = monthStartIn(user.tenant.timezone)

  const [activeCustomers, totalCustomers, openTickets, urgentTickets, collected, overdue, recentCustomers, openTicketList, revenue] =
    await Promise.all([
      prisma.customer.count({ where: { tenantId: t, status: 'ACTIVE' } }),
      prisma.customer.count({ where: { tenantId: t } }),
      prisma.ticket.count({ where: { tenantId: t, status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
      prisma.ticket.count({ where: { tenantId: t, status: { in: ['OPEN', 'IN_PROGRESS'] }, priority: { in: ['HIGH', 'URGENT'] } } }),
      seesMoney
        ? prisma.payment.aggregate({ where: { tenantId: t, status: 'APPROVED', paidDate: { gte: monthStart } }, _sum: { amount: true } })
        : null,
      seesMoney
        ? prisma.invoice.aggregate({ where: { tenantId: t, status: 'OVERDUE' }, _sum: { amount: true }, _count: true })
        : null,
      prisma.customer.findMany({ where: { tenantId: t }, orderBy: { createdAt: 'desc' }, take: 5 }),
      prisma.ticket.findMany({
        where: { tenantId: t, status: { in: ['OPEN', 'IN_PROGRESS'] } },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        take: 5,
        include: { customer: { select: { firstName: true, lastName: true } } },
      }),
      seesMoney ? monthlyRevenue(t, user.tenant.timezone) : null,
    ])

  const isEmpty = totalCustomers === 0

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description={user.tenant.name} />

      {isEmpty && user.role === 'ADMIN' && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <p className="font-medium">Primeros pasos</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>
              Completa los datos de la empresa en <Link className="underline" href="/dashboard/settings">Configuración</Link>.
            </li>
            <li>
              Crea tus <Link className="underline" href="/dashboard/plans">planes</Link> y registra tus{' '}
              <Link className="underline" href="/dashboard/routers">routers</Link>.
            </li>
            <li>
              Registra tus <Link className="underline" href="/dashboard/customers/new">clientes</Link> y asígnales un servicio.
            </li>
            <li>
              Genera las facturas del mes desde <Link className="underline" href="/dashboard/billing">Facturación</Link>.
            </li>
          </ol>
        </div>
      )}

      <StatGrid>
        <StatCard title="Clientes activos" value={formatNumber(activeCustomers)} hint={`${formatNumber(totalCustomers)} registrados`} icon={Users} />
        <StatCard title="Tickets abiertos" value={openTickets} hint={`${urgentTickets} de prioridad alta o urgente`} icon={Ticket} />
        {collected && <StatCard title="Cobrado este mes" value={formatCurrency(collected._sum.amount, currency)} hint="Pagos aprobados" icon={CreditCard} />}
        {overdue && (
          <StatCard title="Cartera vencida" value={formatCurrency(overdue._sum.amount, currency)} hint={`${overdue._count} facturas vencidas`} icon={AlertTriangle} />
        )}
      </StatGrid>

      {revenue && <RevenueChart data={revenue} currency={currency} />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-2">
          <DataTable title="Clientes recientes" headers={['Cliente', 'Teléfono', 'Alta', 'Estado']} rowCount={recentCustomers.length} emptyText="Sin clientes todavía.">
            {recentCustomers.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link href={`/dashboard/customers/${c.id}`} className="font-medium text-blue-700 hover:underline">
                    {c.firstName} {c.lastName}
                  </Link>
                </td>
                <td>{c.phone}</td>
                <td>{formatDay(c.createdAt, user.tenant.timezone)}</td>
                <td>
                  <StatusBadge value={c.status} />
                </td>
              </tr>
            ))}
          </DataTable>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/customers">Ver todos los clientes</Link>
          </Button>
        </div>

        <div className="space-y-2">
          <DataTable title="Tickets pendientes" headers={['Asunto', 'Cliente', 'Prioridad', 'Estado']} rowCount={openTicketList.length} emptyText="No hay tickets pendientes.">
            {openTicketList.map((tk) => (
              <tr key={tk.id}>
                <td>
                  <Link href={`/dashboard/support/${tk.id}`} className="font-medium text-blue-700 hover:underline">
                    {tk.title}
                  </Link>
                </td>
                <td>
                  {tk.customer.firstName} {tk.customer.lastName}
                </td>
                <td>
                  <StatusBadge value={tk.priority} />
                </td>
                <td>
                  <StatusBadge value={tk.status} />
                </td>
              </tr>
            ))}
          </DataTable>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/support">Ver todos los tickets</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
