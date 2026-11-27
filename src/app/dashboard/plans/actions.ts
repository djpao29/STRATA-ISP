'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { PlanKind } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireActionUser } from '@/lib/session'
import { audit } from '@/lib/audit'
import { formToObject, money, requiredNumber, toActionError, type ActionState } from '@/lib/actions'
import { RouterOSError } from '@/lib/mikrotik/client'
import { connectionFor } from '@/lib/mikrotik/connection'
import {
  ensureClientQueue,
  ensurePppProfile,
  getPppProfiles,
  getSimpleQueueSpeeds,
  parseBurst,
  parseRateLimit,
  setSecretProfile,
  speedPlanName,
  BURST_FORMAT_HINT,
} from '@/lib/mikrotik/plans'
import { getMonitoringSettings } from '@/lib/monitoring/settings'

const PATH = '/dashboard/plans'
const speed = requiredNumber((n) => n.int('Número entero').min(1, 'Mínimo 1 Mbps').max(100000))
const priority = z.coerce.number().int().min(1, 'De 1 a 8').max(8, 'De 1 a 8').default(8)
const PROFILE_NAME = /^[A-Za-z0-9 ._\-/]{1,60}$/

const baseSchema = z.object({
  name: z.string({ required_error: 'Obligatorio' }).max(100),
  download: speed,
  upload: speed,
  price: money,
  category: z.enum(['RESIDENTIAL', 'CORPORATE']).default('RESIDENTIAL'),
})
const queueSchema = baseSchema.extend({
  burst: z.string().max(60).refine((v) => parseBurst(v) !== null, BURST_FORMAT_HINT).optional(),
  priorityUp: priority,
  priorityDown: priority,
})
const pppoeSchema = baseSchema.extend({
  pppProfile: z.string().regex(PROFILE_NAME, 'Letras, números, espacio, punto, guion o barra (máx. 60)').optional(),
})

/** Crea (id null) o edita un plan del tipo indicado. */
export async function savePlan(id: string | null, kind: PlanKind, _: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('plans')
    const obj = formToObject(formData)
    const data =
      kind === 'PPPOE'
        ? (() => {
            const d = pppoeSchema.parse(obj)
            return { ...d, pppProfile: d.pppProfile ?? d.name, burst: null, priorityUp: 8, priorityDown: 8 }
          })()
        : (() => {
            const d = queueSchema.parse(obj)
            return { ...d, burst: d.burst ?? null, pppProfile: null }
          })()

    if (id) {
      const plan = await prisma.plan.findFirst({ where: { id, tenantId: user.tenantId } })
      if (!plan) throw new Error('El plan no existe.')
      await prisma.plan.update({ where: { id }, data: { ...data, kind } })
      await audit({ tenantId: user.tenantId, userId: user.id, action: 'plan.update', entity: 'Plan', entityId: id })
    } else {
      const plan = await prisma.plan.create({ data: { ...data, kind, tenantId: user.tenantId } })
      await audit({ tenantId: user.tenantId, userId: user.id, action: 'plan.create', entity: 'Plan', entityId: plan.id })
    }
    revalidatePath(PATH)
    return { ok: true, message: id ? 'Plan actualizado. Usa "Sincronizar" para aplicar la velocidad en el MikroTik.' : 'Plan registrado' }
  } catch (error) {
    return toActionError(error)
  }
}

export async function togglePlan(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('plans')
    const id = z.string().parse(formData.get('id'))
    const plan = await prisma.plan.findFirst({ where: { id, tenantId: user.tenantId } })
    if (!plan) throw new Error('El plan no existe.')
    await prisma.plan.update({ where: { id }, data: { isActive: !plan.isActive } })
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'plan.toggle', entity: 'Plan', entityId: id })
    revalidatePath(PATH)
    return { ok: true, message: plan.isActive ? 'Plan desactivado' : 'Plan activado' }
  } catch (error) {
    return toActionError(error)
  }
}

export async function deletePlan(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('plans')
    const id = z.string().parse(formData.get('id'))
    const plan = await prisma.plan.findFirst({ where: { id, tenantId: user.tenantId }, include: { _count: { select: { services: true } } } })
    if (!plan) throw new Error('El plan no existe.')
    if (plan._count.services > 0) throw new Error('El plan tiene servicios asignados. Desactívalo en lugar de eliminarlo.')
    await prisma.plan.delete({ where: { id } })
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'plan.delete', entity: 'Plan', entityId: id, details: { name: plan.name } })
    revalidatePath(PATH)
    return { ok: true, message: 'Plan eliminado' }
  } catch (error) {
    return toActionError(error)
  }
}

const routerError = (e: unknown) => (e instanceof RouterOSError ? e.message : e instanceof Error ? e.message : 'Error desconocido')

/**
 * Lee los perfiles de /ppp/profile de un MikroTik (solo lectura) y crea un plan PPPoE por cada
 * perfil que aún no exista, con la velocidad de su rate-limit y precio 0 (hay que ponerle precio).
 */
export async function importPppProfiles(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('plans')
    const { routerId } = z.object({ routerId: z.string({ required_error: 'Elige el router' }) }).parse(formToObject(formData))
    const router = await prisma.router.findFirst({ where: { id: routerId, tenantId: user.tenantId, type: 'MIKROTIK' } })
    if (!router) throw new Error('El router no existe.')
    const settings = await getMonitoringSettings(user.tenantId)
    let profiles
    try {
      profiles = await getPppProfiles(connectionFor(router, settings.requestTimeoutSec))
    } catch (e) {
      throw new Error(`${router.name}: ${routerError(e)}`)
    }
    // "default-encryption" es un perfil de sistema que no representa un plan.
    profiles = profiles.filter((p) => p.name && p.name !== 'default-encryption')

    const existing = await prisma.plan.findMany({ where: { tenantId: user.tenantId }, select: { name: true, pppProfile: true } })
    const names = new Set(existing.map((p) => p.name.toLowerCase()))
    const linked = new Set(existing.map((p) => p.pppProfile?.toLowerCase()).filter(Boolean))
    let created = 0
    const skipped: string[] = []
    for (const p of profiles) {
      if (names.has(p.name.toLowerCase()) || linked.has(p.name.toLowerCase())) {
        skipped.push(p.name)
        continue
      }
      const { upload, download } = parseRateLimit(p.rateLimit ?? undefined)
      await prisma.plan.create({
        data: { tenantId: user.tenantId, kind: 'PPPOE', name: p.name, pppProfile: p.name, upload, download, price: 0, description: `Importado de ${router.name}` },
      })
      names.add(p.name.toLowerCase())
      created++
    }
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'plan.import', entity: 'Router', entityId: router.id, details: { created, skipped } })
    revalidatePath(PATH)
    if (profiles.length === 0) return { ok: true, message: `${router.name} no tiene perfiles PPP.` }
    return {
      ok: true,
      message: `${created} plan(es) importado(s) de ${router.name}${skipped.length ? `; ${skipped.length} ya existían` : ''}.${created ? ' Ponles precio antes de asignarlos.' : ''}`,
    }
  } catch (error) {
    return toActionError(error)
  }
}

/**
 * Lee las colas de /queue/simple de un MikroTik (solo lectura) y crea un plan Simple Queue por
 * cada velocidad distinta (max-limit, ráfaga y prioridad) que aún no exista, con precio 0.
 */
export async function importSimpleQueues(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('plans')
    const { routerId } = z.object({ routerId: z.string({ required_error: 'Elige el router' }) }).parse(formToObject(formData))
    const router = await prisma.router.findFirst({ where: { id: routerId, tenantId: user.tenantId, type: 'MIKROTIK' } })
    if (!router) throw new Error('El router no existe.')
    const settings = await getMonitoringSettings(user.tenantId)
    let read
    try {
      read = await getSimpleQueueSpeeds(connectionFor(router, settings.requestTimeoutSec))
    } catch (e) {
      throw new Error(`${router.name}: ${routerError(e)}`)
    }
    if (read.speeds.length === 0) {
      return { ok: true, message: `${router.name} no tiene colas simples de clientes con velocidad (${read.total} cola(s) leída(s)).` }
    }

    const existing = await prisma.plan.findMany({
      where: { tenantId: user.tenantId },
      select: { name: true, kind: true, upload: true, download: true, burst: true, priorityUp: true, priorityDown: true },
    })
    const names = new Set(existing.map((p) => p.name.toLowerCase()))
    const sameSpeed = (s: (typeof read.speeds)[number]) =>
      existing.some(
        (p) =>
          p.kind === 'SIMPLE_QUEUE' &&
          p.upload === s.upload &&
          p.download === s.download &&
          (p.burst || null) === s.burst &&
          p.priorityUp === s.priorityUp &&
          p.priorityDown === s.priorityDown
      )
    let created = 0
    let skipped = 0
    for (const s of read.speeds) {
      if (sameSpeed(s)) {
        skipped++
        continue
      }
      // Si el nombre ya lo usa otro plan (otra ráfaga o prioridad), se distingue con un sufijo.
      const base = speedPlanName(s)
      let name = base
      for (let i = 2; names.has(name.toLowerCase()); i++) name = `${base} (${i})`
      await prisma.plan.create({
        data: {
          tenantId: user.tenantId,
          kind: 'SIMPLE_QUEUE',
          name,
          upload: s.upload,
          download: s.download,
          burst: s.burst,
          priorityUp: s.priorityUp,
          priorityDown: s.priorityDown,
          price: 0,
          description: `Importado de ${router.name} (${s.queues} cola(s) con esta velocidad)`,
        },
      })
      names.add(name.toLowerCase())
      existing.push({ name, kind: 'SIMPLE_QUEUE', upload: s.upload, download: s.download, burst: s.burst, priorityUp: s.priorityUp, priorityDown: s.priorityDown })
      created++
    }
    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'plan.import',
      entity: 'Router',
      entityId: router.id,
      details: { source: '/queue/simple', queues: read.total, speeds: read.speeds.length, created, skipped },
    })
    revalidatePath(PATH)
    return {
      ok: true,
      message: `${read.total} cola(s) leída(s) en ${router.name}, ${read.speeds.length} velocidad(es) distinta(s): ${created} plan(es) nuevo(s)${skipped ? `, ${skipped} ya existían` : ''}.${created ? ' Ponles precio antes de asignarlos.' : ''}`,
    }
  } catch (error) {
    return toActionError(error)
  }
}

/**
 * Aplica el plan en los MikroTik:
 * - PPPoE: crea o ajusta el perfil PPP (rate-limit) y lo asigna al usuario PPPoE de cada cliente del plan.
 * - Simple Queue: crea o ajusta la cola simple de cada cliente del plan (por su IP).
 * Nunca borra nada en el router. Un router que falla no detiene a los demás.
 */
export async function syncPlan(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('plans')
    const id = z.string().parse(formData.get('id'))
    const plan = await prisma.plan.findFirst({ where: { id, tenantId: user.tenantId } })
    if (!plan) throw new Error('El plan no existe.')
    if (plan.download < 1 || plan.upload < 1) throw new Error('Define la velocidad de descarga y subida antes de sincronizar.')

    const services = await prisma.service.findMany({
      where: { tenantId: user.tenantId, planId: plan.id, isActive: true, router: { type: 'MIKROTIK' } },
      include: { router: true, customer: { select: { firstName: true, lastName: true, code: true } } },
    })
    const routers = new Map(services.map((s) => [s.router!.id, s.router!]))
    if (plan.kind === 'PPPOE' && routers.size === 0) {
      // Sin clientes todavía: se deja el perfil listo en todos los MikroTik.
      for (const r of await prisma.router.findMany({ where: { tenantId: user.tenantId, type: 'MIKROTIK' } })) routers.set(r.id, r)
    }
    if (routers.size === 0) throw new Error('Ningún cliente de este plan tiene un MikroTik asignado.')

    const settings = await getMonitoringSettings(user.tenantId)
    const tally = { profiles: 0, clients: 0, unchanged: 0, missing: 0, skipped: 0 }
    const errors: string[] = []
    for (const router of routers.values()) {
      const conn = connectionFor(router, settings.requestTimeoutSec)
      const mine = services.filter((s) => s.routerId === router.id)
      try {
        if (plan.kind === 'PPPOE') {
          const profile = plan.pppProfile || plan.name
          const r = await ensurePppProfile(conn, profile, plan)
          if (r !== 'unchanged') tally.profiles++
          for (const s of mine) {
            if (!s.pppoeUser) {
              tally.skipped++
              continue
            }
            const res = await setSecretProfile(conn, s.pppoeUser, profile)
            if (res === 'updated') tally.clients++
            else if (res === 'missing') tally.missing++
            else tally.unchanged++
          }
        } else {
          for (const s of mine) {
            if (s.mode === 'PPPoE' || !s.ipAddress) {
              tally.skipped++
              continue
            }
            const name = `${s.customer.firstName} ${s.customer.lastName}`.replace(/[^\p{L}\p{N} ._-]/gu, '').slice(0, 50) || `cliente-${s.customer.code}`
            const res = await ensureClientQueue(conn, { name, ip: s.ipAddress }, plan)
            if (res === 'unchanged') tally.unchanged++
            else tally.clients++
          }
        }
      } catch (e) {
        errors.push(`${router.name}: ${routerError(e)}`)
      }
    }

    await audit({ tenantId: user.tenantId, userId: user.id, action: 'plan.sync', entity: 'Plan', entityId: plan.id, details: { ...tally, errors } })
    const parts = [
      plan.kind === 'PPPOE' && tally.profiles ? `perfil creado/ajustado en ${tally.profiles} router(s)` : null,
      `${tally.clients} cliente(s) actualizado(s)`,
      tally.unchanged ? `${tally.unchanged} ya estaban bien` : null,
      tally.missing ? `${tally.missing} usuario(s) PPPoE no existen en el router` : null,
      tally.skipped ? `${tally.skipped} omitido(s) por no tener ${plan.kind === 'PPPOE' ? 'usuario PPPoE' : 'IP fija'}` : null,
    ].filter(Boolean)
    if (errors.length) return { error: `${parts.join(', ')}. Errores: ${errors.join(' · ')}` }
    return { ok: true, message: `Sincronizado: ${parts.join(', ')}.` }
  } catch (error) {
    return toActionError(error)
  }
}
