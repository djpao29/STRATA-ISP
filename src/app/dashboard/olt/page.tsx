import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { DataTable } from '@/components/app/data-table'
import { StatusBadge } from '@/components/app/status-badge'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { createOlt } from './actions'
import { OltForm } from './forms'

export const metadata = { title: 'OLT / FTTH' }

export default async function OltPage() {
  const user = await requireUser('olt')
  const olts = await prisma.oLT.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, host: true, port: true, vendor: true, status: true, onus: { select: { status: true } } },
  })

  return (
    <div className="space-y-6">
      <PageHeader title="OLT / FTTH" description="Equipos OLT y las ONUs instaladas en los clientes" />

      <DataTable
        headers={['OLT', 'Marca', 'Dirección', 'ONUs', 'Activas', 'Sin señal', 'Estado']}
        rowCount={olts.length}
        emptyText="Todavía no hay OLTs registradas."
      >
        {olts.map((o) => (
          <tr key={o.id}>
            <td>
              <Link href={`/dashboard/olt/${o.id}`} className="font-medium text-blue-700 hover:underline">
                {o.name}
              </Link>
            </td>
            <td>{o.vendor ?? '—'}</td>
            <td>
              {o.host}:{o.port}
            </td>
            <td>{o.onus.length}</td>
            <td>{o.onus.filter((n) => n.status === 'ACTIVE').length}</td>
            <td>{o.onus.filter((n) => n.status === 'LOS').length}</td>
            <td>
              <StatusBadge value={o.status} />
            </td>
          </tr>
        ))}
      </DataTable>

      <Card>
        <CardHeader>
          <CardTitle>Nueva OLT</CardTitle>
        </CardHeader>
        <CardContent>
          <OltForm action={createOlt} submitLabel="Guardar OLT" />
        </CardContent>
      </Card>
    </div>
  )
}
