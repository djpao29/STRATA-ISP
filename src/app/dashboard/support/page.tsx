import Link from 'next/link'
import type { Prisma, TicketStatus } from '@prisma/client'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/app/page-header'
import { DataTable } from '@/components/app/data-table'
import { StatusBadge } from '@/components/app/status-badge'
import { PAGE_SIZE, Pagination, SearchBar, param, parsePage } from '@/components/app/list-controls'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { formatDateTime } from '@/lib/format'
import { ticketStatusOptions } from '@/lib/labels'

export const metadata = { title: 'Soporte' }

type Props = { searchParams: Record<string, string | string[] | undefined> }

export default async function SupportPage({ searchParams }: Props) {
  const user = await requireUser('support')
  const q = param(searchParams.q)
  const status = param(searchParams.status) as TicketStatus | undefined
  const page = parsePage(searchParams.page)

  const where: Prisma.TicketWhereInput = {
    tenantId: user.tenantId,
    // Por defecto se muestran los tickets sin cerrar.
    ...(status && ticketStatusOptions.some((o) => o.value === status)
      ? { status }
      : { status: { in: ['OPEN', 'IN_PROGRESS'] } }),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { customer: { firstName: { contains: q, mode: 'insensitive' } } },
            { customer: { lastName: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  }

  const [tickets, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      // URGENT es el último valor del enum: ordenar desc deja los urgentes arriba.
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        customer: { select: { firstName: true, lastName: true } },
        assigned: { select: { name: true } },
        _count: { select: { comments: true } },
      },
    }),
    prisma.ticket.count({ where }),
  ])

  return (
    <div className="space-y-6">
      <PageHeader title="Soporte" description="Tickets abiertos y en progreso (usa el filtro para ver los cerrados)">
        <Button asChild>
          <Link href="/dashboard/support/new">
            <Plus className="mr-2 h-4 w-4" />
            Nuevo ticket
          </Link>
        </Button>
      </PageHeader>

      <SearchBar q={q} status={status} placeholder="Buscar por asunto o cliente" statusOptions={ticketStatusOptions} />

      <DataTable
        headers={['Asunto', 'Cliente', 'Prioridad', 'Estado', 'Asignado a', 'Comentarios', 'Creado']}
        rowCount={tickets.length}
        emptyText="No hay tickets en esta vista."
      >
        {tickets.map((t) => (
          <tr key={t.id}>
            <td>
              <Link href={`/dashboard/support/${t.id}`} className="font-medium text-blue-700 hover:underline">
                {t.title}
              </Link>
            </td>
            <td>
              {t.customer.firstName} {t.customer.lastName}
            </td>
            <td>
              <StatusBadge value={t.priority} />
            </td>
            <td>
              <StatusBadge value={t.status} />
            </td>
            <td>{t.assigned?.name ?? '—'}</td>
            <td>{t._count.comments}</td>
            <td>{formatDateTime(t.createdAt)}</td>
          </tr>
        ))}
      </DataTable>

      <Pagination page={page} total={total} basePath="/dashboard/support" params={{ q, status }} />
    </div>
  )
}
