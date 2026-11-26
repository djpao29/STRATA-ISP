import Link from 'next/link'
import type { CustomerStatus } from '@prisma/client'
import { PageHeader } from '@/components/app/page-header'
import { Button } from '@/components/ui/button'
import { CustomerMap, Legend, type MapPoint } from '@/components/maps/customer-map'
import { parseCoordinates } from '@/lib/geo'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { CUSTOMER_STATUS } from '@/lib/labels'
import { formatCustomerCode } from '@/lib/zones/billing'

export const metadata = { title: 'Mapa de clientes' }

const COLORS: Record<CustomerStatus, string> = {
  ACTIVE: '#16a34a',
  PENDING: '#6b7280',
  SUSPENDED: '#dc2626',
  CANCELLED: '#111827',
}

export default async function CustomersMapPage({ searchParams }: { searchParams: { zone?: string; status?: string } }) {
  const user = await requireUser('customers')
  const status = (Object.keys(COLORS) as CustomerStatus[]).includes(searchParams.status as CustomerStatus) ? (searchParams.status as CustomerStatus) : undefined
  const [customers, zones] = await Promise.all([
    prisma.customer.findMany({
      where: {
        tenantId: user.tenantId,
        status: status ?? { not: 'CANCELLED' },
        ...(searchParams.zone ? { zoneId: searchParams.zone } : {}),
      },
      include: {
        zone: { select: { name: true } },
        services: { where: { isActive: true }, include: { plan: { select: { name: true } } } },
      },
    }),
    prisma.zone.findMany({ where: { tenantId: user.tenantId }, orderBy: { invoiceDay: 'asc' }, select: { id: true, name: true } }),
  ])

  const points: MapPoint[] = []
  let missing = 0
  for (const c of customers) {
    const ll = parseCoordinates(c.coordinates)
    if (!ll) {
      missing++
      continue
    }
    points.push({
      id: c.id,
      name: `${c.firstName} ${c.lastName}`,
      lat: ll[0],
      lng: ll[1],
      color: COLORS[c.status],
      href: `/dashboard/customers/${c.id}`,
      lines: [
        `${formatCustomerCode(c.code)} · ${CUSTOMER_STATUS[c.status]}`,
        c.services.map((s) => s.plan.name).join(', ') || 'Sin plan',
        [c.zone?.name, c.address, c.neighborhood].filter(Boolean).join(' · '),
        c.phone,
      ].filter(Boolean),
    })
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Mapa de clientes" description="Ubicación de las instalaciones según las coordenadas de cada cliente" />
      <form className="flex flex-col gap-2 sm:flex-row">
        <select name="zone" defaultValue={searchParams.zone ?? ''} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
          <option value="">Todas las zonas</option>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>{z.name}</option>
          ))}
        </select>
        <select name="status" defaultValue={status ?? ''} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
          <option value="">Todos menos cancelados</option>
          {(Object.keys(COLORS) as CustomerStatus[]).map((s) => (
            <option key={s} value={s}>{CUSTOMER_STATUS[s]}</option>
          ))}
        </select>
        <Button type="submit" variant="secondary">Filtrar</Button>
      </form>
      <Legend
        items={(Object.keys(COLORS) as CustomerStatus[])
          .filter((s) => s !== 'CANCELLED' || status === 'CANCELLED')
          .map((s) => ({ color: COLORS[s], label: CUSTOMER_STATUS[s], count: points.filter((p) => p.color === COLORS[s]).length }))}
      />
      <CustomerMap points={points} />
      {missing > 0 && (
        <p className="text-sm text-amber-800">
          {missing} cliente(s) sin coordenadas no aparecen en el mapa. Agrégalas en la ficha del cliente (Editar → Coordenadas, p. ej. 18.4861,-69.9312).{' '}
          <Link href="/dashboard/customers" className="underline">Ver clientes</Link>
        </p>
      )}
    </div>
  )
}
