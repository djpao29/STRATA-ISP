import { prisma } from '@/lib/prisma'
import { speedKey, speedPlanName, type SpeedKey } from '@/lib/mikrotik/plans'

/**
 * Busca, por velocidad, el plan Simple Queue de cada una de estas velocidades y crea (con precio 0)
 * los que faltan. Devuelve la clave de velocidad → id del plan.
 */
export async function ensureSpeedPlans(tenantId: string, routerName: string, speeds: Array<SpeedKey & { queues: number }>) {
  const existing = await prisma.plan.findMany({
    where: { tenantId },
    select: { id: true, name: true, kind: true, upload: true, download: true, burst: true, priorityUp: true, priorityDown: true },
  })
  const names = new Set(existing.map((p) => p.name.toLowerCase()))
  const byKey = new Map<string, string>()
  for (const p of existing) {
    if (p.kind !== 'SIMPLE_QUEUE') continue
    const k = speedKey({ ...p, burst: p.burst || null })
    if (!byKey.has(k)) byKey.set(k, p.id)
  }
  let created = 0
  let skipped = 0
  for (const s of speeds) {
    const k = speedKey(s)
    if (byKey.has(k)) {
      skipped++
      continue
    }
    // Si el nombre ya lo usa otro plan (otra ráfaga o prioridad), se distingue con un sufijo.
    const base = speedPlanName(s)
    let name = base
    for (let i = 2; names.has(name.toLowerCase()); i++) name = `${base} (${i})`
    const plan = await prisma.plan.create({
      data: {
        tenantId,
        kind: 'SIMPLE_QUEUE',
        name,
        upload: s.upload,
        download: s.download,
        burst: s.burst,
        priorityUp: s.priorityUp,
        priorityDown: s.priorityDown,
        price: 0,
        description: `Importado de ${routerName} (${s.queues} cola(s) con esta velocidad)`,
      },
    })
    names.add(name.toLowerCase())
    byKey.set(k, plan.id)
    created++
  }
  return { byKey, created, skipped }
}
