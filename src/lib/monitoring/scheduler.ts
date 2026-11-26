import { prisma } from '@/lib/prisma'
import { collectRouter } from './collector'

/**
 * Recolector en segundo plano. Corre dentro del proceso del servidor (arrancado desde
 * src/instrumentation.ts). Revisa cada 10 s qué routers toca consultar según el intervalo
 * de su empresa, con un máximo de consultas simultáneas y nunca dos a la vez al mismo router.
 *
 * Con varias instancias de la app, actívalo solo en una (MONITORING_ENABLED=false en las demás).
 */

const TICK_MS = 10_000
const MAX_CONCURRENT = 4
const CLEANUP_EVERY_MS = 60 * 60 * 1000

type State = { timer?: NodeJS.Timeout; inFlight: Set<string>; lastCleanup: number }
const g = globalThis as unknown as { __wispxMonitor?: State }

async function tick(state: State) {
  const routers = await prisma.router.findMany({
    where: { monitoringEnabled: true, type: 'MIKROTIK', tenant: { isActive: true } },
    select: { id: true, tenantId: true, lastCheckedAt: true },
  })
  if (routers.length === 0) return

  const settings = await prisma.monitoringSettings.findMany({ where: { tenantId: { in: [...new Set(routers.map((r) => r.tenantId))] } } })
  const byTenant = new Map(settings.map((s) => [s.tenantId, s]))
  const now = Date.now()

  const due = routers
    .filter((r) => !state.inFlight.has(r.id))
    .filter((r) => {
      const interval = (byTenant.get(r.tenantId)?.pollIntervalSec ?? 60) * 1000
      return !r.lastCheckedAt || now - r.lastCheckedAt.getTime() >= interval - 1000
    })
    .sort((a, b) => (a.lastCheckedAt?.getTime() ?? 0) - (b.lastCheckedAt?.getTime() ?? 0))
    .slice(0, Math.max(0, MAX_CONCURRENT - state.inFlight.size))

  for (const r of due) {
    state.inFlight.add(r.id)
    collectRouter(r.id, byTenant.get(r.tenantId))
      .catch((e) => console.error('[monitoreo] error inesperado', e))
      .finally(() => state.inFlight.delete(r.id))
  }

  if (now - state.lastCleanup > CLEANUP_EVERY_MS) {
    state.lastCleanup = now
    await cleanupHistory()
  }
}

/** Borra el historial más antiguo que los días de retención de cada empresa. */
export async function cleanupHistory() {
  const all = await prisma.monitoringSettings.findMany()
  for (const s of all) {
    const before = new Date(Date.now() - s.retentionDays * 86_400_000)
    await prisma.routerMetric.deleteMany({ where: { at: { lt: before }, router: { tenantId: s.tenantId } } })
    await prisma.interfaceSample.deleteMany({ where: { at: { lt: before }, interface: { router: { tenantId: s.tenantId } } } })
    await prisma.monitorAlert.deleteMany({ where: { tenantId: s.tenantId, status: 'RESOLVED', resolvedAt: { lt: before } } })
  }
}

export function startMonitoring() {
  if (process.env.MONITORING_ENABLED === 'false') return
  if (g.__wispxMonitor?.timer) return // ya está corriendo (p. ej. tras recarga en desarrollo)
  const state: State = { inFlight: new Set(), lastCleanup: 0 }
  g.__wispxMonitor = state
  const run = () =>
    tick(state)
      .catch((e) => console.error('[monitoreo] fallo del ciclo', e))
      .finally(() => {
        state.timer = setTimeout(run, TICK_MS)
      })
  state.timer = setTimeout(run, 3000)
  console.log('[monitoreo] recolector MikroTik iniciado')
}

/** Ejecuta una consulta inmediata si el router no está ya siendo consultado. */
export async function collectNow(routerId: string) {
  const state = g.__wispxMonitor
  if (state?.inFlight.has(routerId)) return { ok: true as const, latencyMs: 0, alerts: 0, skipped: true }
  state?.inFlight.add(routerId)
  try {
    return await collectRouter(routerId)
  } finally {
    state?.inFlight.delete(routerId)
  }
}
