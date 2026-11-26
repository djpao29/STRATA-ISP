import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { RouterOSError } from '@/lib/mikrotik/client'
import { connectionFor } from '@/lib/mikrotik/connection'
import { monitorTraffic } from '@/lib/mikrotik/routeros'
import { rosGetOptional } from '@/lib/mikrotik/client'
import { toInt, type RosRecord } from '@/lib/mikrotik/parse'
import { apiUser, noStore } from '@/lib/monitoring/api-auth'
import { cached } from '@/lib/monitoring/live-cache'
import { getMonitoringSettings } from '@/lib/monitoring/settings'

export const dynamic = 'force-dynamic'

const NAME = /^[\w.\-@<>()/: ]{1,64}$/

/**
 * Tráfico instantáneo de las interfaces pedidas y carga de CPU por núcleo, leídos del router.
 * ?interfaces=ether1,sfp-sfpplus1  (solo interfaces ya registradas de ese router)
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await apiUser('monitoring')
  if (error) return error

  const router = await prisma.router.findFirst({ where: { id: params.id, tenantId: user.tenantId } })
  if (!router) return NextResponse.json({ error: 'Router no encontrado' }, { status: 404 })

  const requested = (new URL(req.url).searchParams.get('interfaces') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => NAME.test(s))
    .slice(0, 8)
  // Solo nombres de interfaces que el sistema ya conoce de este router.
  const known = await prisma.routerInterface.findMany({
    where: { routerId: router.id, name: { in: requested }, missing: false },
    select: { name: true },
  })
  const names = known.map((k) => k.name).sort()

  const settings = await getMonitoringSettings(user.tenantId)
  const ttl = Math.max(2000, settings.liveRefreshSec * 1000 - 500)

  try {
    const conn = connectionFor(router, settings.requestTimeoutSec)
    const [traffic, cores] = await Promise.all([
      cached(`traffic:${router.id}:${names.join(',')}`, ttl, () => monitorTraffic(conn, names)),
      cached(`cores:${router.id}`, ttl, async () =>
        ((await rosGetOptional<RosRecord[]>(conn, '/system/resource/cpu', ['cpu', 'load'])) ?? []).map((c) => ({
          name: c.cpu ?? '',
          load: toInt(c.load),
        }))
      ),
    ])
    return NextResponse.json({ at: new Date().toISOString(), traffic, cores }, noStore)
  } catch (e) {
    const message = e instanceof RouterOSError ? e.message : 'No se pudo consultar el router'
    if (!(e instanceof RouterOSError)) console.error('[monitoreo] live', e)
    return NextResponse.json({ error: message }, { status: 502, ...noStore })
  }
}
