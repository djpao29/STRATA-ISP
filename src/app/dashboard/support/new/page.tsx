import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { ROLE_LABELS } from '@/lib/permissions'
import { createTicket } from '../actions'
import { TicketForm } from '../forms'

export const metadata = { title: 'Nuevo ticket' }

export default async function NewTicketPage({ searchParams }: { searchParams: { customerId?: string } }) {
  const user = await requireUser('support')
  const [customers, users] = await Promise.all([
    prisma.customer.findMany({
      where: { tenantId: user.tenantId, status: { not: 'CANCELLED' } },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: { id: true, firstName: true, lastName: true, cedula: true },
    }),
    prisma.user.findMany({ where: { tenantId: user.tenantId, isActive: true }, orderBy: { name: 'asc' } }),
  ])

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Nuevo ticket" />
      <Card>
        <CardContent className="pt-6">
          {customers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Primero registra un cliente.</p>
          ) : (
            <TicketForm
              action={createTicket}
              customers={customers.map((c) => ({ value: c.id, label: `${c.lastName} ${c.firstName} · ${c.cedula}` }))}
              users={users.map((u) => ({ value: u.id, label: `${u.name} (${ROLE_LABELS[u.role]})` }))}
              defaultCustomerId={customers.some((c) => c.id === searchParams.customerId) ? searchParams.customerId : undefined}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
