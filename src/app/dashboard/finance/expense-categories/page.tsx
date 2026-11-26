import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { StatusBadge } from '@/components/app/status-badge'
import { ActionButton } from '@/components/forms/action-form'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { formatCurrency } from '@/lib/format'
import { createCategory, deleteCategory, toggleCategory } from '../expenses/actions'
import { CategoryForm } from '../expenses/forms'

export const metadata = { title: 'Categorías de gastos' }

export default async function ExpenseCategoriesPage() {
  const user = await requireUser('expenses')
  const [categories, totals] = await Promise.all([
    prisma.expenseCategory.findMany({
      where: { tenantId: user.tenantId },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { expenses: true } } },
    }),
    prisma.expense.groupBy({ by: ['categoryId'], where: { tenantId: user.tenantId }, _sum: { amount: true } }),
  ])
  const total = new Map(totals.map((t) => [t.categoryId, t._sum.amount]))

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Categorías de gastos" description="Agrupan los gastos para la contabilidad" />
      <Card>
        <CardContent className="pt-6">
          <CategoryForm action={createCategory} />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <ul className="divide-y">
            {categories.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div>
                  <span className="font-medium">{c.name}</span>{' '}
                  <span className="text-xs text-muted-foreground">
                    {c._count.expenses} gasto(s) · {formatCurrency(total.get(c.id) ?? 0, user.tenant.currency)}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <StatusBadge value={c.isActive ? 'ACTIVE' : 'INACTIVE'} />
                  <ActionButton action={toggleCategory} fields={{ id: c.id }} variant="outline" size="sm">
                    {c.isActive ? 'Desactivar' : 'Activar'}
                  </ActionButton>
                  <ActionButton action={deleteCategory} fields={{ id: c.id }} variant="ghost" size="sm" className="text-red-600" confirm={`¿Eliminar "${c.name}"?`}>
                    Eliminar
                  </ActionButton>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
