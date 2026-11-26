import { notFound } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { updatePlan } from '../../actions'
import { PlanForm } from '../../plan-form'

export const metadata = { title: 'Editar plan' }

export default async function EditPlanPage({ params }: { params: { id: string } }) {
  const user = await requireUser('plans')
  const plan = await prisma.plan.findFirst({ where: { id: params.id, tenantId: user.tenantId } })
  if (!plan) notFound()

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title={`Editar plan: ${plan.name}`}
        description="El nuevo precio se aplica a las facturas que se generen a partir de ahora."
      />
      <Card>
        <CardContent className="pt-6">
          <PlanForm
            action={updatePlan.bind(null, plan.id)}
            plan={{ ...plan, price: plan.price.toFixed(2) }}
            submitLabel="Guardar cambios"
          />
        </CardContent>
      </Card>
    </div>
  )
}
