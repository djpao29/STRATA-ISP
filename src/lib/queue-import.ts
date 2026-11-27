import { prisma } from '@/lib/prisma'
import { parseRateLimit, speedKey, speedPlanName, type SpeedKey } from '@/lib/mikrotik/plans'

/** Plan PPPoE que usa este perfil (por perfil o, si no tiene, por nombre). */
export async function pppPlansByProfile(tenantId: string) {
  const plans = await prisma.plan.findMany({ where: { tenantId, kind: 'PPPOE' }, orderBy: { isActive: 'desc' }, select: { id: true, name: true, pppProfile: true } })
  const map = new Map<string, { id: string; name: string }>()
  for (const p of plans) {
    const k = (p.pppProfile || p.name).toLowerCase()
    if (!map.has(k)) map.set(k, { id: p.id, name: p.name })
  }
  return map
}

/**
 * Crea (precio 0) los planes PPPoE de los perfiles que aún no tienen plan, con la velocidad
 * de su rate-limit. Devuelve perfil (en minúsculas) → id del plan.
 */
export async function ensurePppPlans(tenantId: string, routerName: string, profiles: Array<{ name: string; rateLimit: string | null }>, wanted: string[]) {
  const byProfile = await pppPlansByProfile(tenantId)
  const names = new Set((await prisma.plan.findMany({ where: { tenantId }, select: { name: true } })).map((p) => p.name.toLowerCase()))
  const ids = new Map([...byProfile].map(([k, v]) => [k, v.id]))
  let created = 0
  for (const profile of new Set(wanted)) {
    const k = profile.toLowerCase()
    if (ids.has(k)) continue
    const rate = profiles.find((p) => p.name.toLowerCase() === k)?.rateLimit ?? null
    const { upload, download } = parseRateLimit(rate ?? undefined)
    // Si el nombre ya lo usa un plan Simple Queue, se distingue.
    let name = profile
    for (let i = 1; names.has(name.toLowerCase()); i++) name = i === 1 ? `${profile} (PPPoE)` : `${profile} (PPPoE ${i})`
    const plan = await prisma.plan.create({
      data: { tenantId, kind: 'PPPOE', name, pppProfile: profile, upload, download, price: 0, description: `Importado de ${routerName}` },
    })
    names.add(name.toLowerCase())
    ids.set(k, plan.id)
    created++
  }
  return { ids, created }
}

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
