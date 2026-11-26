import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/app/page-header'
import { DataTable } from '@/components/app/data-table'
import { StatusBadge } from '@/components/app/status-badge'
import { ActionButton } from '@/components/forms/action-form'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { formatCurrency } from '@/lib/format'
import { CLIENT_MODE } from '@/lib/labels'
import { syncPlan, togglePlan } from '../actions'

export const metadata = { title: 'Plan' }

export default async function PlanPage({ params }: { params: { id: string } }) {
  const user = await requireUser('plans')
  const plan = await prisma.plan.findFirst({ where: { id: params.id, tenantId: user.tenantId } })
  if (!plan) notFound()
  const services = await prisma.service.findMany({
    where: { planId: plan.id },
    include: { customer: { select: { id: true, firstName: true, lastName: true, status: true } }, router: { select: { name: true } } },
    orderBy: { customer: { lastName: 'asc' } },
  })
  const back = `/dashboard/plans${plan.kind === 'PPPOE' ? '?tipo=pppoe' : ''}`
  const speed = `${plan.download}/${plan.upload} Mbps`

  return (
    <div className="space-y-6">
      <PageHeader
        title={plan.name}
        description={[
          plan.kind === 'PPPOE' ? `PPPoE · perfil ${plan.pppProfile || plan.name}` : 'Simple Queue',
          plan.category === 'CORPORATE' ? 'Corporativo' : 'Residencial',
          speed,
          formatCurrency(plan.price, user.tenant.currency),
          plan.kind === 'SIMPLE_QUEUE' ? `prioridad ${plan.priorityUp}/${plan.priorityDown}${plan.burst ? ` · burst ${plan.burst}` : ''}` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      >
        <ActionButton action={syncPlan} fields={{ id: plan.id }} variant="outline" confirm="Se aplicará la velocidad del plan en los MikroTik de sus clientes. ¿Continuar?">
          Sincronizar con MikroTik
        </ActionButton>
        <ActionButton action={togglePlan} fields={{ id: plan.id }} variant="outline">
          {plan.isActive ? 'Desactivar plan' : 'Activar plan'}
        </ActionButton>
        <Link href={back} className="text-sm text-blue-700 hover:underline">
          Volver a planes
        </Link>
      </PageHeader>

      {!plan.isActive && <p className="rounded-md border bg-gray-50 px-3 py-2 text-sm">Plan desactivado: no aparece al asignar servicios nuevos.</p>}

      <DataTable title={`Clientes del plan (${services.length})`} headers={['Cliente', 'Estado', 'Modo', 'Usuario PPPoE / IP', 'Router', 'Servicio']} rowCount={services.length} emptyText="Ningún cliente tiene este plan.">
        {services.map((s) => (
          <tr key={s.id}>
            <td>
              <Link href={`/dashboard/customers/${s.customer.id}`} className="font-medium text-blue-700 hover:underline">
                {s.customer.firstName} {s.customer.lastName}
              </Link>
            </td>
            <td>
              <StatusBadge value={s.customer.status} />
            </td>
            <td>{CLIENT_MODE[s.mode]}</td>
            <td className="font-mono text-xs">{s.pppoeUser ?? s.ipAddress ?? '—'}</td>
            <td>{s.router?.name ?? '—'}</td>
            <td>{s.isActive ? 'Activo' : 'Inactivo'}</td>
          </tr>
        ))}
      </DataTable>
    </div>
  )
}
