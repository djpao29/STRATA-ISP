import Link from 'next/link'
import type { Prisma } from '@prisma/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { SearchBar, param } from '@/components/app/list-controls'
import { ActionButton } from '@/components/forms/action-form'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { formatDateTime } from '@/lib/format'
import { deleteDevice, saveDevice } from './actions'
import { DeviceForm, RevealSecret } from './forms'

export const metadata = { title: 'Wifi Router' }

type Props = { searchParams: { q?: string; customerId?: string } }

export default async function DevicesPage({ searchParams }: Props) {
  const user = await requireUser('devices')
  const q = param(searchParams.q)
  const customerId = param(searchParams.customerId)

  const where: Prisma.CustomerDeviceWhereInput = {
    tenantId: user.tenantId,
    ...(customerId ? { customerId } : {}),
    ...(q
      ? {
          OR: [
            { serial: { contains: q, mode: 'insensitive' } },
            { macAddress: { contains: q, mode: 'insensitive' } },
            { ssid: { contains: q, mode: 'insensitive' } },
            { managementIp: { contains: q } },
            { brand: { contains: q, mode: 'insensitive' } },
            { model: { contains: q, mode: 'insensitive' } },
            { customer: { OR: [{ firstName: { contains: q, mode: 'insensitive' } }, { lastName: { contains: q, mode: 'insensitive' } }] } },
          ],
        }
      : {}),
  }

  const [devices, fixedCustomer, customers] = await Promise.all([
    prisma.customerDevice.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 200,
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, services: { select: { id: true, pppoeUser: true, ipAddress: true, plan: { select: { name: true } } } } } },
        service: { select: { pppoeUser: true, ipAddress: true, plan: { select: { name: true } } } },
      },
    }),
    customerId
      ? prisma.customer.findFirst({
          where: { id: customerId, tenantId: user.tenantId },
          select: { id: true, firstName: true, lastName: true, services: { select: { id: true, pppoeUser: true, ipAddress: true, plan: { select: { name: true } } } } },
        })
      : null,
    customerId
      ? []
      : prisma.customer.findMany({
          where: { tenantId: user.tenantId, status: { not: 'CANCELLED' } },
          select: { id: true, firstName: true, lastName: true, cedula: true },
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        }),
  ])

  const serviceOptions = (services: Array<{ id: string; pppoeUser: string | null; ipAddress: string | null; plan: { name: string } }>) =>
    services.map((s) => ({ value: s.id, label: [s.plan.name, s.pppoeUser ?? s.ipAddress].filter(Boolean).join(' · ') }))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Wifi Router"
        description={fixedCustomer ? `Equipos de ${fixedCustomer.firstName} ${fixedCustomer.lastName}` : 'Ficha de los routers WiFi y ONU instalados en cada cliente. Las claves se guardan cifradas.'}
      >
        {fixedCustomer && (
          <Link href={`/dashboard/customers/${fixedCustomer.id}`} className="text-sm text-blue-700 hover:underline">
            Volver a la ficha del cliente
          </Link>
        )}
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle>Registrar equipo</CardTitle>
        </CardHeader>
        <CardContent>
          {customerId && !fixedCustomer ? (
            <p className="text-sm text-red-700">El cliente no existe.</p>
          ) : (
            <DeviceForm
              action={saveDevice.bind(null, null)}
              customers={fixedCustomer ? undefined : customers.map((c) => ({ value: c.id, label: `${c.lastName}, ${c.firstName}${c.cedula ? ` · ${c.cedula}` : ''}` }))}
              services={fixedCustomer ? serviceOptions(fixedCustomer.services) : undefined}
              submitLabel="Registrar equipo"
              fixedCustomerId={fixedCustomer?.id}
            />
          )}
        </CardContent>
      </Card>

      <SearchBar q={q} placeholder="Buscar por cliente, serie, MAC, SSID, IP o marca" />

      {devices.length === 0 ? (
        <p className="rounded-md border bg-white py-10 text-center text-sm text-muted-foreground">
          {q || customerId ? 'Sin equipos con ese filtro.' : 'Todavía no hay equipos registrados.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {devices.map((d) => (
            <Card key={d.id}>
              <CardContent className="space-y-3 pt-6 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Link href={`/dashboard/customers/${d.customer.id}`} className="font-semibold text-blue-700 hover:underline">
                      {d.customer.firstName} {d.customer.lastName}
                    </Link>
                    <div className="text-muted-foreground">
                      {[d.brand, d.model].filter(Boolean).join(' ') || 'Equipo sin marca'}
                      {d.service && ` · ${[d.service.plan.name, d.service.pppoeUser ?? d.service.ipAddress].filter(Boolean).join(' · ')}`}
                    </div>
                  </div>
                  <ActionButton action={deleteDevice} fields={{ id: d.id }} variant="outline" size="sm" confirm="¿Eliminar este equipo y sus claves guardadas?">
                    Eliminar
                  </ActionButton>
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                  <dt className="text-muted-foreground">Serie</dt>
                  <dd>{d.serial ?? '—'}</dd>
                  <dt className="text-muted-foreground">MAC</dt>
                  <dd className="font-mono text-xs">{d.macAddress ?? '—'}</dd>
                  <dt className="text-muted-foreground">IP admin.</dt>
                  <dd className="font-mono text-xs">{d.managementIp ?? '—'}</dd>
                  <dt className="text-muted-foreground">Red WiFi</dt>
                  <dd>
                    {d.ssid ?? '—'}
                    {d.band && <span className="text-muted-foreground"> · {d.band}</span>}
                  </dd>
                  <dt className="text-muted-foreground">Clave WiFi</dt>
                  <dd>{d.wifiPasswordEnc ? <RevealSecret id={d.id} which="wifi" /> : '—'}</dd>
                  <dt className="text-muted-foreground">Administración</dt>
                  <dd className="flex flex-wrap items-center gap-2">
                    {d.adminUser ?? '—'}
                    {d.adminPasswordEnc && <RevealSecret id={d.id} which="admin" />}
                  </dd>
                </dl>
                {d.notes && <p className="whitespace-pre-line rounded-md bg-gray-50 p-2">{d.notes}</p>}
                <details>
                  <summary className="cursor-pointer text-blue-700">Editar equipo</summary>
                  <div className="mt-3">
                    <DeviceForm
                      action={saveDevice.bind(null, d.id)}
                      services={serviceOptions(d.customer.services)}
                      values={{
                        customerId: d.customerId,
                        serviceId: d.serviceId,
                        brand: d.brand,
                        model: d.model,
                        serial: d.serial,
                        macAddress: d.macAddress,
                        managementIp: d.managementIp,
                        ssid: d.ssid,
                        adminUser: d.adminUser,
                        band: d.band,
                        notes: d.notes,
                        hasWifiPassword: !!d.wifiPasswordEnc,
                        hasAdminPassword: !!d.adminPasswordEnc,
                      }}
                      submitLabel="Guardar cambios"
                    />
                  </div>
                </details>
                <p className="text-xs text-muted-foreground">Actualizado {formatDateTime(d.updatedAt, user.tenant.timezone)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
