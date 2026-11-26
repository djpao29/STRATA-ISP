import { PageHeader } from '@/components/app/page-header'
import { FtthMap, type FtthData } from '@/components/maps/ftth-map'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { parseCoordinates } from '@/lib/geo'
import { ONU_STATUS_LABEL } from '@/lib/olt/labels'

export const metadata = { title: 'Mapa FTTH' }

const COLOR = { ACTIVE: '#10b981', POWER_OFF: '#f59e0b', LOS: '#ef4444', OFFLINE: '#ef4444', INACTIVE: '#6b7280', UNKNOWN: '#9ca3af' } as const

export default async function FtthMapPage() {
  const user = await requireUser('olt')
  const [olts, naps, onus] = await Promise.all([
    prisma.oLT.findMany({ where: { tenantId: user.tenantId }, select: { id: true, name: true, host: true, coordinates: true, status: true } }),
    prisma.napBox.findMany({ where: { tenantId: user.tenantId }, include: { _count: { select: { onus: true } } } }),
    prisma.oNU.findMany({
      where: { olt: { tenantId: user.tenantId }, authState: 'AUTHORIZED', customerId: { not: null } },
      select: { serial: true, status: true, inOlt: true, rxPower: true, napBoxId: true, napPort: true, oltId: true, customer: { select: { id: true, firstName: true, lastName: true, coordinates: true } } },
    }),
  ])

  const data: FtthData = { olts: [], naps: [], clients: [], links: [] }
  const oltPos = new Map<string, [number, number]>()
  for (const o of olts) {
    const p = parseCoordinates(o.coordinates)
    if (!p) continue
    oltPos.set(o.id, p)
    data.olts.push({ id: o.id, name: o.name, pos: p, lines: [o.host, o.status === 'ONLINE' ? 'En línea' : o.status === 'OFFLINE' ? 'Sin respuesta' : 'Sin leer'] })
  }
  const napPos = new Map<string, [number, number]>()
  for (const n of naps) {
    const p = parseCoordinates(n.coordinates)
    if (!p) continue
    napPos.set(n.id, p)
    data.naps.push({ id: n.id, name: n.name, pos: p, lines: [`${n._count.onus}/${n.capacity} puertos${n.splitter ? ` · ${n.splitter}` : ''}`, n.address ?? ''].filter(Boolean) })
    const op = n.oltId ? oltPos.get(n.oltId) : undefined
    if (op) data.links.push({ from: op, to: p, kind: 'feeder', ok: true })
  }
  let noCoords = 0
  for (const o of onus) {
    const p = parseCoordinates(o.customer!.coordinates)
    if (!p) {
      noCoords++
      continue
    }
    const status = o.inOlt ? o.status : 'UNKNOWN'
    data.clients.push({
      id: o.serial,
      name: `${o.customer!.firstName} ${o.customer!.lastName}`,
      pos: p,
      color: COLOR[status],
      href: `/dashboard/customers/${o.customer!.id}`,
      lines: [`ONU ${o.serial}`, o.inOlt ? ONU_STATUS_LABEL[o.status] : 'No aparece en la OLT', o.rxPower != null ? `Señal ${o.rxPower} dBm` : '', o.napPort ? `Puerto NAP ${o.napPort}` : ''].filter(Boolean),
    })
    const np = o.napBoxId ? napPos.get(o.napBoxId) : undefined
    if (np) data.links.push({ from: np, to: p, kind: 'drop', ok: status === 'ACTIVE' })
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Mapa FTTH" description="OLTs, cajas NAP y clientes con ONU. Línea azul: troncal OLT → NAP; punteada: acometida NAP → cliente (roja si la ONU está fuera de línea)." />
      <div className="flex flex-wrap gap-4 text-xs">
        {[
          ['#2563eb', 'OLT'],
          ['#7c3aed', 'Caja NAP'],
          ['#10b981', 'ONU en línea'],
          ['#f59e0b', 'Sin energía'],
          ['#ef4444', 'Fuera de línea'],
          ['#9ca3af', 'Sin leer'],
        ].map(([c, l]) => (
          <span key={l} className="flex items-center gap-1">
            <span className="h-3 w-3 rounded-full" style={{ background: c }} /> {l}
          </span>
        ))}
      </div>
      <FtthMap data={data} />
      <p className="text-xs text-muted-foreground">
        {data.olts.length} OLT · {data.naps.length} cajas NAP · {data.clients.length} clientes en el mapa
        {noCoords ? ` · ${noCoords} cliente(s) con ONU sin coordenadas` : ''}
        {olts.length > data.olts.length ? ` · ${olts.length - data.olts.length} OLT sin ubicación` : ''}
        {naps.length > data.naps.length ? ` · ${naps.length - data.naps.length} NAP sin ubicación` : ''}
      </p>
    </div>
  )
}
