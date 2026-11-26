import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { StatusBadge } from '@/components/app/status-badge'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { ROLE_LABELS } from '@/lib/permissions'
import { formatDateTime } from '@/lib/format'
import { addComment, updateTicket } from '../actions'
import { CommentForm, TicketUpdateForm } from '../forms'

export default async function TicketDetailPage({ params }: { params: { id: string } }) {
  const user = await requireUser('support')
  const ticket = await prisma.ticket.findFirst({
    where: { id: params.id, tenantId: user.tenantId },
    include: {
      customer: true,
      assigned: { select: { name: true } },
      comments: { orderBy: { createdAt: 'asc' }, include: { user: { select: { name: true } } } },
    },
  })
  if (!ticket) notFound()

  const users = await prisma.user.findMany({ where: { tenantId: user.tenantId, isActive: true }, orderBy: { name: 'asc' } })

  return (
    <div className="space-y-6">
      <PageHeader title={ticket.title} description={`Abierto el ${formatDateTime(ticket.createdAt)}`}>
        <StatusBadge value={ticket.priority} />
        <StatusBadge value={ticket.status} />
      </PageHeader>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Descripción</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-line text-sm">{ticket.description}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Seguimiento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {ticket.comments.length === 0 && <p className="text-sm text-muted-foreground">Sin comentarios todavía.</p>}
              {ticket.comments.map((c) => (
                <div key={c.id} className="rounded-md border bg-gray-50 p-3 text-sm">
                  <div className="mb-1 text-xs text-muted-foreground">
                    <span className="font-medium text-gray-900">{c.user.name}</span> · {formatDateTime(c.createdAt)}
                  </div>
                  <p className="whitespace-pre-line">{c.message}</p>
                </div>
              ))}
              <CommentForm action={addComment.bind(null, ticket.id)} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Cliente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <Link href={`/dashboard/customers/${ticket.customerId}`} className="font-medium text-blue-700 hover:underline">
                {ticket.customer.firstName} {ticket.customer.lastName}
              </Link>
              <div>{ticket.customer.phone}</div>
              {ticket.customer.address && <div className="text-muted-foreground">{ticket.customer.address}</div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Gestión</CardTitle>
            </CardHeader>
            <CardContent>
              <TicketUpdateForm
                action={updateTicket.bind(null, ticket.id)}
                users={users.map((u) => ({ value: u.id, label: `${u.name} (${ROLE_LABELS[u.role]})` }))}
                status={ticket.status}
                priority={ticket.priority}
                assignedTo={ticket.assignedTo}
              />
              {ticket.closedAt && (
                <p className="mt-3 text-xs text-muted-foreground">Cerrado el {formatDateTime(ticket.closedAt)}</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
