import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { DataTable } from '@/components/app/data-table'
import { StatusBadge } from '@/components/app/status-badge'
import { ActionButton } from '@/components/forms/action-form'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { addOnu, deleteOlt, deleteOnu, setOnuStatus, updateOlt } from '../actions'
import { OltForm, OnuForm } from '../forms'

export default async function OltDetailPage({ params }: { params: { id: string } }) {
  const user = await requireUser('olt')
  const olt = await prisma.oLT.findFirst({
    where: { id: params.id, tenantId: user.tenantId },
    select: {
      id: true,
      name: true,
      host: true,
      port: true,
      vendor: true,
      status: true,
      onus: {
        orderBy: [{ slot: 'asc' }, { port: 'asc' }, { onuIndex: 'asc' }],
        include: { customer: { select: { id: true, firstName: true, lastName: true } } },
      },
    },
  })
  if (!olt) notFound()

  const customers = await prisma.customer.findMany({
    where: { tenantId: user.tenantId, status: { not: 'CANCELLED' } },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    select: { id: true, firstName: true, lastName: true, cedula: true },
  })

  return (
    <div className="space-y-6">
      <PageHeader title={olt.name} description={`${olt.vendor ?? 'OLT'} · ${olt.host}:${olt.port}`}>
        <StatusBadge value={olt.status} />
        <ActionButton
          action={deleteOlt}
          fields={{ id: olt.id }}
          variant="outline"
          className="text-red-600"
          confirm="¿Eliminar esta OLT? Solo es posible si no tiene ONUs."
        >
          Eliminar OLT
        </ActionButton>
      </PageHeader>

      <DataTable
        title="ONUs"
        headers={['Serial', 'Descripción', 'Slot/Puerto/ID', 'Cliente', 'Estado', '']}
        rowCount={olt.onus.length}
        emptyText="Sin ONUs registradas en esta OLT."
      >
        {olt.onus.map((n) => (
          <tr key={n.id}>
            <td className="font-mono">{n.serial}</td>
            <td>{n.name ?? '—'}</td>
            <td>
              {n.slot}/{n.port}
              {n.onuIndex != null && `/${n.onuIndex}`}
            </td>
            <td>
              {n.customer ? (
                <Link href={`/dashboard/customers/${n.customer.id}`} className="hover:underline">
                  {n.customer.firstName} {n.customer.lastName}
                </Link>
              ) : (
                '—'
              )}
            </td>
            <td>
              <StatusBadge value={n.status} />
            </td>
            <td className="space-x-1 whitespace-nowrap text-right">
              {(['ACTIVE', 'INACTIVE', 'LOS'] as const)
                .filter((s) => s !== n.status)
                .map((s) => (
                  <ActionButton key={s} action={setOnuStatus} fields={{ id: n.id, status: s }} variant="outline" size="sm">
                    {s === 'ACTIVE' ? 'Activa' : s === 'INACTIVE' ? 'Inactiva' : 'LOS'}
                  </ActionButton>
                ))}
              <ActionButton
                action={deleteOnu}
                fields={{ id: n.id }}
                variant="ghost"
                size="sm"
                className="text-red-600"
                confirm={`¿Eliminar la ONU ${n.serial}?`}
              >
                Eliminar
              </ActionButton>
            </td>
          </tr>
        ))}
      </DataTable>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Registrar ONU</CardTitle>
          </CardHeader>
          <CardContent>
            <OnuForm
              action={addOnu.bind(null, olt.id)}
              customers={customers.map((c) => ({ value: c.id, label: `${c.lastName} ${c.firstName} · ${c.cedula}` }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Datos de la OLT</CardTitle>
          </CardHeader>
          <CardContent>
            <OltForm action={updateOlt.bind(null, olt.id)} olt={olt} submitLabel="Guardar cambios" />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
