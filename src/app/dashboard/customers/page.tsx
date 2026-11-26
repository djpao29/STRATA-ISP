import Link from 'next/link'
import type { CustomerStatus, Prisma } from '@prisma/client'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/app/page-header'
import { DataTable } from '@/components/app/data-table'
import { StatusBadge } from '@/components/app/status-badge'
import { PAGE_SIZE, Pagination, SearchBar, param, parsePage } from '@/components/app/list-controls'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { can } from '@/lib/permissions'
import { customerStatusOptions } from '@/lib/labels'

export const metadata = { title: 'Clientes' }

type Props = { searchParams: Record<string, string | string[] | undefined> }

export default async function CustomersPage({ searchParams }: Props) {
  const user = await requireUser('customers')
  const q = param(searchParams.q)
  const status = param(searchParams.status) as CustomerStatus | undefined
  const page = parsePage(searchParams.page)

  const where: Prisma.CustomerWhereInput = {
    tenantId: user.tenantId,
    ...(status && customerStatusOptions.some((o) => o.value === status) ? { status } : {}),
    ...(q
      ? {
          OR: [
            { firstName: { contains: q, mode: 'insensitive' } },
            { lastName: { contains: q, mode: 'insensitive' } },
            { cedula: { contains: q } },
            { phone: { contains: q } },
            { email: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
  }

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { services: { where: { isActive: true }, include: { plan: { select: { name: true } } } } },
    }),
    prisma.customer.count({ where }),
  ])

  return (
    <div className="space-y-6">
      <PageHeader title="Clientes" description="Abonados del servicio de internet">
        {can(user.role, 'customersWrite') && (
          <Button asChild>
            <Link href="/dashboard/customers/new">
              <Plus className="mr-2 h-4 w-4" />
              Nuevo cliente
            </Link>
          </Button>
        )}
      </PageHeader>

      <SearchBar q={q} status={status} placeholder="Buscar por nombre, cédula, teléfono o correo" statusOptions={customerStatusOptions} />

      <DataTable
        headers={['Cliente', 'Cédula', 'Teléfono', 'Ciudad', 'Plan activo', 'Estado']}
        rowCount={customers.length}
        emptyText={q || status ? 'Ningún cliente coincide con el filtro.' : 'Todavía no hay clientes. Crea el primero.'}
      >
        {customers.map((c) => (
          <tr key={c.id}>
            <td>
              <Link href={`/dashboard/customers/${c.id}`} className="font-medium text-blue-700 hover:underline">
                {c.firstName} {c.lastName}
              </Link>
              {c.email && <div className="text-xs text-muted-foreground">{c.email}</div>}
            </td>
            <td>{c.cedula}</td>
            <td>{c.phone}</td>
            <td>{c.city ?? '—'}</td>
            <td>{c.services.map((s) => s.plan.name).join(', ') || '—'}</td>
            <td>
              <StatusBadge value={c.status} />
            </td>
          </tr>
        ))}
      </DataTable>

      <Pagination page={page} total={total} basePath="/dashboard/customers" params={{ q, status }} />
    </div>
  )
}
