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
import { formatCustomerCode } from '@/lib/zones/billing'

export const metadata = { title: 'Clientes' }

type Props = { searchParams: Record<string, string | string[] | undefined> }

export default async function CustomersPage({ searchParams }: Props) {
  const user = await requireUser('customers')
  const q = param(searchParams.q)
  const status = param(searchParams.status) as CustomerStatus | undefined
  const page = parsePage(searchParams.page)
  const zoneId = param(searchParams.zone)

  const where: Prisma.CustomerWhereInput = {
    tenantId: user.tenantId,
    ...(zoneId ? { zoneId: zoneId === 'none' ? null : zoneId } : {}),
    ...(status && customerStatusOptions.some((o) => o.value === status) ? { status } : {}),
    ...(q
      ? {
          OR: [
            { firstName: { contains: q, mode: 'insensitive' } },
            { lastName: { contains: q, mode: 'insensitive' } },
            { cedula: { contains: q } },
            { phone: { contains: q } },
            { email: { contains: q, mode: 'insensitive' } },
            ...(/^c?-?\d+$/i.test(q) ? [{ code: Number(q.replace(/\D/g, '')) }] : []),
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
      include: {
        services: { where: { isActive: true }, include: { plan: { select: { name: true } } } },
        zone: { select: { name: true } },
      },
    }),
    prisma.customer.count({ where }),
  ])
  const zones = await prisma.zone.findMany({ where: { tenantId: user.tenantId }, orderBy: { invoiceDay: 'asc' }, select: { id: true, name: true } })

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

      <SearchBar q={q} status={status} placeholder="Buscar por código, nombre, cédula, teléfono o correo" statusOptions={customerStatusOptions} />
      <div className="flex flex-wrap gap-1 text-xs">
        <span className="py-1 text-muted-foreground">Zona:</span>
        {[{ id: '', name: 'Todas' }, ...zones, { id: 'none', name: 'Sin zona' }].map((z) => {
          const sp = new URLSearchParams()
          if (q) sp.set('q', q)
          if (status) sp.set('status', status)
          if (z.id) sp.set('zone', z.id)
          const active = (zoneId ?? '') === z.id
          return (
            <Link
              key={z.id || 'all'}
              href={`/dashboard/customers?${sp.toString()}`}
              className={active ? 'rounded-full border border-blue-600 bg-blue-50 px-3 py-1 text-blue-700' : 'rounded-full border px-3 py-1 text-muted-foreground'}
            >
              {z.name}
            </Link>
          )
        })}
      </div>

      <DataTable
        headers={['Código', 'Cliente', 'Cédula', 'Teléfono', 'Zona', 'Plan activo', 'Estado']}
        rowCount={customers.length}
        emptyText={q || status ? 'Ningún cliente coincide con el filtro.' : 'Todavía no hay clientes. Crea el primero.'}
      >
        {customers.map((c) => (
          <tr key={c.id}>
            <td className="font-mono text-xs">{formatCustomerCode(c.code)}</td>
            <td>
              <Link href={`/dashboard/customers/${c.id}`} className="font-medium text-blue-700 hover:underline">
                {c.firstName} {c.lastName}
              </Link>
              {c.email && <div className="text-xs text-muted-foreground">{c.email}</div>}
            </td>
            <td>{c.cedula}</td>
            <td>{c.phone}</td>
            <td>{c.zone?.name ?? <span className="text-amber-700">Sin zona</span>}</td>
            <td>{c.services.map((s) => s.plan.name).join(', ') || '—'}</td>
            <td>
              <StatusBadge value={c.status} />
            </td>
          </tr>
        ))}
      </DataTable>

      <Pagination page={page} total={total} basePath="/dashboard/customers" params={{ q, status, zone: zoneId }} />
    </div>
  )
}
