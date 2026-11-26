import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiUser, jsonSafe, noStore } from '@/lib/monitoring/api-auth'
import { interfaceHistory, metricHistory, parseRange } from '@/lib/monitoring/queries'

export const dynamic = 'force-dynamic'

/** Historial agrupado: ?range=1h|6h|24h|7d y opcionalmente ?interface=<id> */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await apiUser('monitoring')
  if (error) return error
  const router = await prisma.router.findFirst({ where: { id: params.id, tenantId: user.tenantId }, select: { id: true } })
  if (!router) return NextResponse.json({ error: 'Router no encontrado' }, { status: 404 })

  const url = new URL(req.url)
  const { from, bucketSec, hours } = parseRange(url.searchParams.get('range'))
  const interfaceId = url.searchParams.get('interface')

  const metrics = await metricHistory(router.id, from, bucketSec)
  let traffic = null
  if (interfaceId) {
    const iface = await prisma.routerInterface.findFirst({ where: { id: interfaceId, routerId: router.id }, select: { id: true } })
    if (iface) traffic = await interfaceHistory(iface.id, from, bucketSec)
  }
  return NextResponse.json(jsonSafe({ hours, bucketSec, metrics, traffic }), noStore)
}
