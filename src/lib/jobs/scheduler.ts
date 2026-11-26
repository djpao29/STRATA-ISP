import { randomUUID } from 'crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { markOverdueInvoices } from '@/lib/billing'
import { runZoneBilling } from '@/lib/zones/billing'
import { processNetworkActions, runReconnections, runSuspensions } from '@/lib/zones/network'
import { runPromises } from '@/lib/promises'
import { processCampaigns } from '@/lib/notifications'

/**
 * Tareas programadas del backend (no dependen de que alguien abra el panel):
 * cada minuto, por empresa: facturación por zonas → vencimientos → cortes → reconexiones,
 * y luego la cola de acciones en los routers (con reintentos).
 *
 * Un bloqueo en la base de datos garantiza que solo una instancia de la app las ejecute a la vez.
 */

const TICK_MS = 60_000
const LOCK = 'billing-and-suspensions'
const LOCK_TTL_MS = 5 * 60_000
const OWNER = randomUUID()

type State = { timer?: NodeJS.Timeout; running: boolean }
const g = globalThis as unknown as { __wispxJobs?: State }

async function acquireLock() {
  const rows = await prisma.$queryRaw<Array<{ owner: string }>>`
    INSERT INTO job_locks (name, owner, "lockedUntil")
    VALUES (${LOCK}, ${OWNER}, now() + make_interval(secs => ${LOCK_TTL_MS / 1000}))
    ON CONFLICT (name) DO UPDATE SET owner = EXCLUDED.owner, "lockedUntil" = EXCLUDED."lockedUntil"
    WHERE job_locks."lockedUntil" < now() OR job_locks.owner = ${OWNER}
    RETURNING owner`
  return rows.length > 0
}

async function releaseLock() {
  await prisma.$executeRaw`UPDATE job_locks SET "lockedUntil" = now() WHERE name = ${LOCK} AND owner = ${OWNER}`
}

/** Un ciclo completo para una empresa. Se puede llamar a mano (botón "Ejecutar ahora"). */
export async function runTenantJobs(tenantId: string, now = new Date()) {
  const started = new Date()
  const summary: Record<string, unknown> = {}
  let ok = true
  try {
    summary.billing = await runZoneBilling(tenantId, { now })
    await markOverdueInvoices(tenantId)
    summary.promises = await runPromises(tenantId, now)
    summary.suspensions = await runSuspensions(tenantId, now)
    summary.reconnections = await runReconnections(tenantId, now)
  } catch (error) {
    ok = false
    summary.error = error instanceof Error ? error.message : String(error)
    console.error('[tareas] error en empresa', tenantId, error)
  }
  const billing = (summary.billing as Array<{ created: number; errors: number }> | undefined) ?? []
  const changed =
    !ok ||
    billing.some((b) => b.created > 0 || b.errors > 0) ||
    ((summary.suspensions as { suspended?: number })?.suspended ?? 0) > 0 ||
    ((summary.reconnections as { reconnected?: number })?.reconnected ?? 0) > 0
  // Se guarda cada ejecución que hizo algo; las vacías solo la última (para mostrar "última revisión").
  if (!changed) await prisma.jobRun.deleteMany({ where: { tenantId, job: 'zones', ok: true, summary: { path: ['changed'], equals: false } } })
  await prisma.jobRun.create({
    data: { tenantId, job: 'zones', startedAt: started, finishedAt: new Date(), ok, summary: { ...summary, changed } as Prisma.InputJsonValue },
  })
  return { ok, summary }
}

async function tick(state: State) {
  if (state.running) return
  state.running = true
  try {
    if (!(await acquireLock())) return // otra instancia está ejecutando las tareas
    try {
      const tenants = await prisma.tenant.findMany({ where: { isActive: true }, select: { id: true } })
      for (const t of tenants) await runTenantJobs(t.id)
      await processNetworkActions({ limit: 50 })
      // Mensajes de WhatsApp que quedaron en cola o deben reintentarse.
      await processCampaigns({ limit: 200 }).catch((e) => console.error('[tareas] notificaciones', e))
    } finally {
      await releaseLock()
    }
  } catch (error) {
    console.error('[tareas] fallo del ciclo', error)
  } finally {
    state.running = false
  }
}

export function startJobs() {
  if (process.env.JOBS_ENABLED === 'false') return
  if (g.__wispxJobs?.timer) return
  const state: State = { running: false }
  g.__wispxJobs = state
  const loop = () =>
    tick(state).finally(() => {
      state.timer = setTimeout(loop, TICK_MS)
    })
  state.timer = setTimeout(loop, 5000)
  console.log('[tareas] facturación por zonas y cortes automáticos iniciados')
}
