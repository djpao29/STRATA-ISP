import Link from 'next/link'
import type { Prisma } from '@prisma/client'
import { AlertTriangle, Router, Wifi, WifiOff } from 'lucide-react'
import { PageHeader } from '@/components/app/page-header'
import { DataTable } from '@/components/app/data-table'
import { StatusBadge } from '@/components/app/status-badge'
import { StatCard, StatGrid } from '@/components/app/stat-card'
import { PAGE_SIZE, Pagination, param, parsePage } from '@/components/app/list-controls'
import { Button } from '@/components/ui/button'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { CLIENT_MODE } from '@/lib/labels'

export const metadata = { title: 'Red' }

type Props = { searchParams: Record<string, string | string[] | undefined> }

export default async function NetworkPage({ searchParams }: Props) {
  const user = await requireUser('network')
  const q = param(searchParams.q)
  const routerId = param(searchParams.router)
  const page = parsePage(searchParams.page)

  const where: Prisma.ServiceWhereInput = {
    tenantId: user.tenantId,
    ...(routerId ? { routerId: routerId === 'none' ? null : routerId } : {}),
    ...(q
      ? {
          OR: [
            { ipAddress: { contains: q } },
            { macAddress: { contains: q, mode: 'insensitive' } },
            { pppoeUser: { contains: q, mode: 'insensitive' } },
            { customer: { firstName: { contains: q, mode: 'insensitive' } } },
            { customer: { lastName: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  }

  const [services, total, routers, active, inactive, duplicates] = await Promise.all([
    prisma.service.findMany({
      where,
      orderBy: [{ ipAddress: 'asc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, status: true } },
        plan: { select: { name: true, download: true, upload: true } },
        router: { select: { name: true } },
      },
    }),
    prisma.service.count({ where }),
    prisma.router.findMany({ where: { tenantId: user.tenantId }, orderBy: { name: 'asc' }, select: { id: true, name: true, status: true } }),
    prisma.service.count({ where: { tenantId: user.tenantId, isActive: true } }),
    prisma.service.count({ where: { tenantId: user.tenantId, isActive: false } }),
    prisma.service.groupBy({
      by: ['ipAddress'],
      where: { tenantId: user.tenantId, ipAddress: { not: null } },
      _count: { _all: true },
      having: { ipAddress: { _count: { gt: 1 } } },
    }),
  ])

  const duplicateIps = new Set(duplicates.map((d) => d.ipAddress))

  return (
    <div className="space-y-6">
      <PageHeader title="Red" description="Inventario de servicios: direcciones IP, MAC, usuarios PPPoE y router asignado" />

      <StatGrid>
        <StatCard title="Servicios activos" value={active} icon={Wifi} />
        <StatCard title="Servicios inactivos" value={inactive} icon={WifiOff} />
        <StatCard
          title="Routers en línea"
          value={`${routers.filter((r) => r.status === 'ONLINE').length} / ${routers.length}`}
          hint="Según la última comprobación"
          icon={Router}
        />
        <StatCard title="IPs duplicadas" value={duplicateIps.size} hint={duplicateIps.size ? 'Revisa los marcados en rojo' : 'Sin conflictos'} icon={AlertTriangle} />
      </StatGrid>

      <form className="flex flex-col gap-2 sm:flex-row" role="search">
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar por IP, MAC, usuario PPPoE o cliente"
          className="flex h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <select name="router" defaultValue={routerId ?? ''} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
          <option value="">Todos los routers</option>
          <option value="none">Sin router</option>
          {routers.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
      </form>

      <DataTable
        headers={['IP', 'MAC', 'Modo', 'Usuario PPPoE', 'Cliente', 'Plan', 'Router', 'Servicio']}
        rowCount={services.length}
        emptyText="No hay servicios que coincidan."
      >
        {services.map((s) => (
          <tr key={s.id}>
            <td className={s.ipAddress && duplicateIps.has(s.ipAddress) ? 'font-semibold text-red-600' : 'font-mono'}>
              {s.ipAddress ?? '—'}
            </td>
            <td className="font-mono text-xs">{s.macAddress ?? '—'}</td>
            <td>{CLIENT_MODE[s.mode]}</td>
            <td>{s.pppoeUser ?? '—'}</td>
            <td>
              <Link href={`/dashboard/customers/${s.customer.id}`} className="hover:underline">
                {s.customer.firstName} {s.customer.lastName}
              </Link>
            </td>
            <td>
              {s.plan.name}
              <div className="text-xs text-muted-foreground">
                {s.plan.download}/{s.plan.upload} Mbps
              </div>
            </td>
            <td>{s.router?.name ?? '—'}</td>
            <td>
              <StatusBadge value={s.isActive ? 'ACTIVE' : 'INACTIVE'} />
            </td>
          </tr>
        ))}
      </DataTable>

      <Pagination page={page} total={total} basePath="/dashboard/network" params={{ q, router: routerId }} />
    </div>
  )
}
