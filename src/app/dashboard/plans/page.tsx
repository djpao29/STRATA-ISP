import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/app/page-header'
import { DataTable } from '@/components/app/data-table'
import { StatusBadge } from '@/components/app/status-badge'
import { ActionButton } from '@/components/forms/action-form'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { formatCurrency } from '@/lib/format'
import { createPlan, deletePlan, togglePlan } from './actions'
import { PlanForm } from './plan-form'

export const metadata = { title: 'Planes' }

export default async function PlansPage() {
  const user = await requireUser('plans')
  const plans = await prisma.plan.findMany({
    where: { tenantId: user.tenantId },
    orderBy: [{ isActive: 'desc' }, { price: 'asc' }],
    include: { _count: { select: { services: { where: { isActive: true } } } } },
  })

  return (
    <div className="space-y-6">
      <PageHeader title="Planes" description="Planes de internet que se pueden contratar" />

      <Card>
        <CardHeader>
          <CardTitle>Nuevo plan</CardTitle>
        </CardHeader>
        <CardContent>
          <PlanForm action={createPlan} submitLabel="Crear plan" />
        </CardContent>
      </Card>

      <DataTable
        headers={['Plan', 'Velocidad', 'Precio', 'Servicios activos', 'Estado', '']}
        rowCount={plans.length}
        emptyText="Todavía no hay planes."
      >
        {plans.map((p) => (
          <tr key={p.id}>
            <td>
              <div className="font-medium">{p.name}</div>
              {p.description && <div className="text-xs text-muted-foreground">{p.description}</div>}
            </td>
            <td>
              {p.download}/{p.upload} Mbps
            </td>
            <td>{formatCurrency(p.price, user.tenant.currency)}</td>
            <td>{p._count.services}</td>
            <td>
              <StatusBadge value={p.isActive ? 'ACTIVE' : 'INACTIVE'} />
            </td>
            <td className="space-x-1 text-right">
              <Button asChild variant="outline" size="sm">
                <Link href={`/dashboard/plans/${p.id}/edit`}>Editar</Link>
              </Button>
              <ActionButton action={togglePlan} fields={{ id: p.id }} variant="outline" size="sm">
                {p.isActive ? 'Desactivar' : 'Activar'}
              </ActionButton>
              <ActionButton
                action={deletePlan}
                fields={{ id: p.id }}
                variant="ghost"
                size="sm"
                className="text-red-600"
                confirm="¿Eliminar este plan?"
              >
                Eliminar
              </ActionButton>
            </td>
          </tr>
        ))}
      </DataTable>
    </div>
  )
}
