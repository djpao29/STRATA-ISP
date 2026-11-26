import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { RouterOSError } from '@/lib/mikrotik/client'
import { connectionFor } from '@/lib/mikrotik/connection'
import { getArp, getDefaultRouteInterfaces, getInterfaces } from '@/lib/mikrotik/routeros'
import { getDhcpLeases } from '@/lib/mikrotik/plans'
import { apiUser, noStore } from '@/lib/monitoring/api-auth'
import { getMonitoringSettings } from '@/lib/monitoring/settings'

export const dynamic = 'force-dynamic'

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/

/**
 * Consultas de solo lectura al MikroTik para el alta de clientes:
 * - what=interfaces → interfaces (LAN) y las WAN detectadas por las rutas por defecto.
 * - what=leases     → leases del servidor DHCP.
 * - what=ip&ip=…    → si la IP está libre (en el sistema y en el router), su MAC y la siguiente libre del /24.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await apiUser('customersWrite')
  if (error) return error
  const router = await prisma.router.findFirst({ where: { id: params.id, tenantId: user.tenantId, type: 'MIKROTIK' } })
  if (!router) return NextResponse.json({ error: 'Router no encontrado' }, { status: 404 })
  const url = new URL(req.url)
  const what = url.searchParams.get('what')
  const settings = await getMonitoringSettings(user.tenantId)
  const conn = connectionFor(router, settings.requestTimeoutSec)

  try {
    if (what === 'interfaces') {
      const [ifaces, wans] = await Promise.all([getInterfaces(conn), getDefaultRouteInterfaces(conn).catch(() => [] as string[])])
      return NextResponse.json(
        {
          interfaces: ifaces.filter((i) => !i.disabled).map((i) => ({ name: i.name, type: i.type, comment: i.comment, running: i.running })),
          wans,
        },
        noStore
      )
    }
    if (what === 'leases') {
      return NextResponse.json({ leases: await getDhcpLeases(conn) }, noStore)
    }
    if (what === 'ip') {
      const ip = url.searchParams.get('ip')?.trim() ?? ''
      if (!IPV4.test(ip)) return NextResponse.json({ error: 'IP inválida' }, { status: 400 })
      const [arp, leases, used] = await Promise.all([
        getArp(conn),
        getDhcpLeases(conn),
        prisma.service.findMany({
          where: { tenantId: user.tenantId, ipAddress: { startsWith: ip.split('.').slice(0, 3).join('.') + '.' } },
          select: { ipAddress: true, customer: { select: { firstName: true, lastName: true } } },
        }),
      ])
      const owner = used.find((s) => s.ipAddress === ip)
      const arpHit = arp.find((a) => a.address === ip)
      const leaseHit = leases.find((l) => l.address === ip)
      const taken = new Set([...used.map((s) => s.ipAddress), ...arp.map((a) => a.address), ...leases.map((l) => l.address)])
      const prefix = ip.split('.').slice(0, 3).join('.')
      const start = Number(ip.split('.')[3])
      let suggestion: string | null = null
      for (let i = 1; i < 255 && !suggestion; i++) {
        const n = ((start - 1 + i) % 253) + 2 // 2..254: se evitan .0, .1 (gateway habitual) y .255
        const candidate = `${prefix}.${n}`
        if (!taken.has(candidate)) suggestion = candidate
      }
      return NextResponse.json(
        {
          ip,
          inSystem: owner ? `${owner.customer.firstName} ${owner.customer.lastName}` : null,
          inRouter: !!(arpHit || leaseHit),
          mac: leaseHit?.mac ?? arpHit?.mac ?? null,
          hostName: leaseHit?.hostName ?? null,
          suggestion,
        },
        noStore
      )
    }
    return NextResponse.json({ error: 'Consulta no válida' }, { status: 400 })
  } catch (e) {
    const message = e instanceof RouterOSError ? e.message : 'No se pudo consultar el router'
    if (!(e instanceof RouterOSError)) console.error('[alta] lookup', e)
    return NextResponse.json({ error: `${router.name}: ${message}` }, { status: 502, ...noStore })
  }
}
