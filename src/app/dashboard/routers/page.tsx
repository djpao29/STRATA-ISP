import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/app/page-header'
import { DataTable } from '@/components/app/data-table'
import { StatusBadge } from '@/components/app/status-badge'
import { ActionButton } from '@/components/forms/action-form'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { formatDateTime } from '@/lib/format'
import { ROUTER_TYPE } from '@/lib/labels'
import { deleteRouter, testRouter } from './actions'

export const metadata = { title: 'Routers' }

export default async function RoutersPage() {
  const user = await requireUser('routers')
  const routers = await prisma.router.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      host: true,
      port: true,
      type: true,
      status: true,
      lastCheckedAt: true,
      _count: { select: { services: { where: { isActive: true } } } },
    },
  })

  return (
    <div className="space-y-6">
      <PageHeader title="Routers" description="Equipos de borde donde se conectan los clientes. MikroTik: API REST de RouterOS 7">
        <Button asChild>
          <Link href="/dashboard/routers/new">
            <Plus className="mr-2 h-4 w-4" />
            Nuevo router
          </Link>
        </Button>
      </PageHeader>

      <DataTable
        headers={['Nombre', 'Tipo', 'Dirección', 'Servicios activos', 'Estado', 'Última comprobación', '']}
        rowCount={routers.length}
        emptyText="Todavía no hay routers registrados."
      >
        {routers.map((r) => (
          <tr key={r.id}>
            <td className="font-medium">{r.name}</td>
            <td>{ROUTER_TYPE[r.type]}</td>
            <td>
              {r.host}:{r.port}
            </td>
            <td>{r._count.services}</td>
            <td>
              <StatusBadge value={r.status} />
            </td>
            <td>{formatDateTime(r.lastCheckedAt)}</td>
            <td className="space-x-1 whitespace-nowrap text-right">
              {r.type === 'MIKROTIK' && (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/dashboard/monitoring/${r.id}`}>Monitorear</Link>
                </Button>
              )}
              <ActionButton action={testRouter} fields={{ id: r.id }} variant="outline" size="sm">
                Probar conexión
              </ActionButton>
              <Button asChild variant="outline" size="sm">
                <Link href={`/dashboard/routers/${r.id}/edit`}>Editar</Link>
              </Button>
              <ActionButton
                action={deleteRouter}
                fields={{ id: r.id }}
                variant="ghost"
                size="sm"
                className="text-red-600"
                confirm="¿Eliminar este router?"
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
