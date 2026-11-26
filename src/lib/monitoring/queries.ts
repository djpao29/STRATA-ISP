import { prisma } from '@/lib/prisma'

/** Campos del router que se pueden enviar al navegador (nunca usuario ni contraseña). */
export const routerPublicSelect = {
  id: true,
  name: true,
  host: true,
  port: true,
  useHttps: true,
  status: true,
  monitoringEnabled: true,
  identity: true,
  model: true,
  osVersion: true,
  lastSeenAt: true,
  lastCheckedAt: true,
  lastError: true,
  latencyMs: true,
} as const

export async function overview(tenantId: string) {
  const routers = await prisma.router.findMany({
    where: { tenantId, type: 'MIKROTIK' },
    orderBy: { name: 'asc' },
    select: {
      ...routerPublicSelect,
      metrics: { orderBy: { at: 'desc' }, take: 1 },
      _count: { select: { alerts: { where: { status: 'ACTIVE' } } } },
    },
  })
  const alerts = await prisma.monitorAlert.findMany({
    where: { tenantId, status: 'ACTIVE' },
    orderBy: [{ severity: 'desc' }, { startedAt: 'desc' }],
    take: 50,
    include: { router: { select: { name: true } } },
  })
  return {
    routers: routers.map(({ metrics, _count, ...r }) => ({ ...r, metric: metrics[0] ?? null, activeAlerts: _count.alerts })),
    alerts,
  }
}

export async function routerDetail(tenantId: string, routerId: string) {
  const router = await prisma.router.findFirst({
    where: { id: routerId, tenantId },
    select: {
      ...routerPublicSelect,
      metrics: { orderBy: { at: 'desc' }, take: 1 },
      interfaces: { orderBy: [{ role: 'asc' }, { name: 'asc' }] },
      alerts: { orderBy: { startedAt: 'desc' }, take: 30 },
    },
  })
  if (!router) return null
  const { metrics, ...rest } = router
  return { ...rest, metric: metrics[0] ?? null }
}

const RANGES: Record<string, number> = { '1h': 1, '6h': 6, '24h': 24, '7d': 168 }

export function parseRange(value: string | null) {
  const hours = RANGES[value ?? ''] ?? 24
  // ~240 puntos por gráfico, con un mínimo de 60 s por punto.
  const bucketSec = Math.max(60, Math.round((hours * 3600) / 240))
  return { hours, bucketSec, from: new Date(Date.now() - hours * 3600_000) }
}

/** Historial de CPU, memoria, latencia y tráfico WAN agrupado por intervalos. */
export async function metricHistory(routerId: string, from: Date, bucketSec: number) {
  return prisma.$queryRaw<
    Array<{ t: Date; cpu: number; mem: number; latency: number; temp: number | null; rx: number | null; tx: number | null; ppp: number | null }>
  >`
    SELECT to_timestamp(floor(extract(epoch FROM "at") / ${bucketSec}) * ${bucketSec}) AS t,
           avg("cpuLoad")::float AS cpu,
           avg("memUsed"::float / NULLIF("memTotal", 0) * 100)::float AS mem,
           avg("latencyMs")::float AS latency,
           avg("temperature")::float AS temp,
           avg("wanRxBps")::float AS rx,
           avg("wanTxBps")::float AS tx,
           max("pppActive")::float AS ppp
    FROM router_metrics
    WHERE "routerId" = ${routerId} AND "at" >= ${from}
    GROUP BY 1 ORDER BY 1`
}

export async function interfaceHistory(interfaceId: string, from: Date, bucketSec: number) {
  return prisma.$queryRaw<Array<{ t: Date; rx: number; tx: number }>>`
    SELECT to_timestamp(floor(extract(epoch FROM "at") / ${bucketSec}) * ${bucketSec}) AS t,
           avg("rxBps")::float AS rx,
           avg("txBps")::float AS tx
    FROM interface_samples
    WHERE "interfaceId" = ${interfaceId} AND "at" >= ${from}
    GROUP BY 1 ORDER BY 1`
}
