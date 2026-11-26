import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { StatusBadge } from '@/components/app/status-badge'
import { ActionButton } from '@/components/forms/action-form'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { formatCurrency } from '@/lib/format'
import { monthStartIn } from '@/lib/dates'
import { PAYMENT_METHOD } from '@/lib/labels'
import { deleteAccount, saveAccount, toggleAccount } from './actions'
import { AccountForm } from './account-form'

export const metadata = { title: 'Formas de pago' }

export default async function AccountsPage({ searchParams }: { searchParams: { edit?: string } }) {
  const user = await requireUser('paymentAccounts')
  const monthStart = monthStartIn(user.tenant.timezone)
  const [accounts, monthTotals] = await Promise.all([
    prisma.paymentAccount.findMany({
      where: { tenantId: user.tenantId },
      orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { payments: true, expenses: true } } },
    }),
    prisma.payment.groupBy({
      by: ['accountId'],
      where: { tenantId: user.tenantId, status: 'APPROVED', paidDate: { gte: monthStart } },
      _sum: { amount: true },
    }),
  ])
  const totals = new Map(monthTotals.map((t) => [t.accountId, t._sum.amount]))
  const editing = accounts.find((a) => a.id === searchParams.edit)

  return (
    <div className="space-y-6">
      <PageHeader title="Formas de pago" description="Cajas, cuentas bancarias y otros medios donde recibes los pagos" />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{editing ? `Editar: ${editing.name}` : 'Nueva forma de pago'}</CardTitle>
        </CardHeader>
        <CardContent>
          <AccountForm
            key={editing?.id ?? 'new'}
            action={saveAccount.bind(null, editing?.id ?? null)}
            account={editing}
            submitLabel={editing ? 'Guardar cambios' : 'Crear forma de pago'}
          />
          {editing && (
            <a href="/dashboard/finance/accounts" className="mt-2 inline-block text-sm text-muted-foreground hover:underline">
              Cancelar edición
            </a>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {accounts.map((a) => (
          <Card key={a.id} className={a.isActive ? '' : 'opacity-60'}>
            <CardContent className="space-y-3 pt-6">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{a.name}</div>
                  <div className="text-xs text-muted-foreground">{PAYMENT_METHOD[a.method]}</div>
                </div>
                <StatusBadge value={a.isActive ? 'ACTIVE' : 'INACTIVE'} />
              </div>
              {a.details && <p className="whitespace-pre-line rounded-md bg-gray-50 px-3 py-2 text-sm">{a.details}</p>}
              <div className="text-sm">
                Cobrado este mes: <strong>{formatCurrency(totals.get(a.id) ?? 0, user.tenant.currency)}</strong>
                <span className="text-xs text-muted-foreground"> · {a._count.payments} pagos · {a._count.expenses} gastos</span>
              </div>
              <div className="flex flex-wrap gap-1">
                <a href={`/dashboard/finance/accounts?edit=${a.id}`} className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-accent">
                  Editar
                </a>
                <ActionButton action={toggleAccount} fields={{ id: a.id }} variant="outline" size="sm">
                  {a.isActive ? 'Desactivar' : 'Activar'}
                </ActionButton>
                <ActionButton action={deleteAccount} fields={{ id: a.id }} variant="ghost" size="sm" className="text-red-600" confirm={`¿Eliminar "${a.name}"?`}>
                  Eliminar
                </ActionButton>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
