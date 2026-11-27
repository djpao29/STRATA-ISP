'use server'

import { revalidatePath } from 'next/cache'
import type { Router } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireActionUser } from '@/lib/session'
import { audit } from '@/lib/audit'
import { RouterOSError } from '@/lib/mikrotik/client'
import { connectionFor } from '@/lib/mikrotik/connection'
import {
  getPppProfiles,
  getPppSecrets,
  getSimpleQueues,
  groupQueueSpeeds,
  pppClientName,
  pppClients,
  queueClients,
  speedKey,
  speedPlanName,
  splitQueueName,
} from '@/lib/mikrotik/plans'
import { getMonitoringSettings } from '@/lib/monitoring/settings'
import { createCustomerWithService, type NewCustomerInput } from '@/lib/onboarding'
import { ensurePppPlans, ensureSpeedPlans, pppPlansByProfile } from '@/lib/queue-import'

/** Tope por importación, para que una sola corrida no se alargue demasiado. */
const MAX_PER_RUN = 500

export type ImportKind = 'SIMPLE_QUEUE' | 'PPPOE'

export type ImportRow = {
  key: string
  /** Nombre de la cola o usuario PPPoE. */
  source: string
  ip: string | null
  firstName: string
  lastName: string
  /** Velocidad (Simple Queue) o perfil (PPPoE). */
  speed: string
  plan: string | null
  disabled: boolean
  /** Cliente que ya tiene esta IP o este usuario PPPoE en el sistema (no se importa). */
  existing: string | null
}

export type ImportPreview =
  | { ok: true; router: string; total: number; ignored: number; rows: ImportRow[]; newCount: number; newPlans: number; noPassword: number }
  | { ok: false; error: string }

const errorText = (e: unknown) => (e instanceof RouterOSError || e instanceof Error ? e.message : 'Error desconocido')

type Candidate = {
  row: ImportRow
  /** Datos para crear el cliente, sin el plan (se resuelve al importar). */
  customer: Omit<NewCustomerInput['customer'], 'zoneId'>
  service: Omit<NonNullable<NewCustomerInput['service']>, 'planId' | 'routerId'>
  planKey: string
}

async function loadRouter(tenantId: string, routerId: string) {
  const router = await prisma.router.findFirst({ where: { id: routerId, tenantId, type: 'MIKROTIK' } })
  if (!router) throw new Error('El router no existe.')
  const settings = await getMonitoringSettings(tenantId)
  return { router, conn: connectionFor(router, settings.requestTimeoutSec) }
}

const fullName = (c: { firstName: string; lastName: string }) => `${c.firstName} ${c.lastName}`.trim()

/** Lee el router (solo lectura) y arma los clientes candidatos con lo que ya existe en el sistema. */
async function readCandidates(tenantId: string, routerId: string, kind: ImportKind) {
  const { router, conn } = await loadRouter(tenantId, routerId)
  const wrap = async <T>(p: Promise<T>) => {
    try {
      return await p
    } catch (e) {
      throw new Error(`${router.name}: ${errorText(e)}`)
    }
  }
  return kind === 'PPPOE' ? readPpp(tenantId, router, await wrap(getPppSecrets(conn)), await wrap(getPppProfiles(conn))) : readQueues(tenantId, router, await wrap(getSimpleQueues(conn)))
}

async function taken(tenantId: string, ips: string[], users: string[]) {
  const services = await prisma.service.findMany({
    where: {
      tenantId,
      OR: [{ ipAddress: { in: ips } }, ...(users.length ? [{ pppoeUser: { in: users, mode: 'insensitive' as const } }] : [])],
    },
    select: { ipAddress: true, pppoeUser: true, customer: { select: { firstName: true, lastName: true } } },
  })
  const byIp = new Map<string, string>()
  const byUser = new Map<string, string>()
  for (const s of services) {
    if (s.ipAddress) byIp.set(s.ipAddress, fullName(s.customer))
    if (s.pppoeUser) byUser.set(s.pppoeUser.toLowerCase(), fullName(s.customer))
  }
  return { byIp, byUser }
}

async function readQueues(tenantId: string, router: Router, rows: Awaited<ReturnType<typeof getSimpleQueues>>) {
  const { clients, ignored } = queueClients(rows)
  const seen = new Set<string>()
  const list = clients.filter((c) => (seen.has(c.ip) ? false : (seen.add(c.ip), true)))
  const { byIp } = await taken(tenantId, list.map((c) => c.ip), [])
  const plans = await prisma.plan.findMany({
    where: { tenantId, kind: 'SIMPLE_QUEUE' },
    select: { name: true, upload: true, download: true, burst: true, priorityUp: true, priorityDown: true },
  })
  const planByKey = new Map(plans.map((p) => [speedKey({ ...p, burst: p.burst || null }), p.name]))
  const candidates: Candidate[] = list.map((c) => {
    const name = splitQueueName(c.queue)
    return {
      row: {
        key: c.ip,
        source: c.queue,
        ip: c.ip,
        ...name,
        speed: speedPlanName(c.speed),
        plan: planByKey.get(speedKey(c.speed)) ?? null,
        disabled: c.disabled,
        existing: byIp.get(c.ip) ?? null,
      },
      customer: {
        ...name,
        phone: '',
        notes: [`Importado de la cola «${c.queue}» de ${router.name}.`, c.comment].filter(Boolean).join(' '),
        status: 'ACTIVE',
        suspendExempt: false,
      },
      service: { mode: 'STATIC_IP', ipAddress: c.ip, discount: 0, syncRouter: false },
      planKey: speedKey(c.speed),
    }
  })
  const ensurePlans = async (picked: Candidate[]) => {
    const keys = new Set(picked.map((c) => c.planKey))
    const speeds = groupQueueSpeeds(rows).speeds.filter((s) => keys.has(speedKey(s)))
    const r = await ensureSpeedPlans(tenantId, router.name, speeds)
    return { ids: r.byKey, created: r.created }
  }
  return { router, total: rows.length, ignored: ignored + (clients.length - list.length), candidates, ensurePlans, noPassword: 0 }
}

async function readPpp(
  tenantId: string,
  router: Router,
  rows: Awaited<ReturnType<typeof getPppSecrets>>,
  profiles: Awaited<ReturnType<typeof getPppProfiles>>
) {
  const { clients, ignored } = pppClients(rows)
  const { byIp, byUser } = await taken(
    tenantId,
    clients.map((c) => c.ip).filter((ip): ip is string => Boolean(ip)),
    clients.map((c) => c.user)
  )
  const plans = await pppPlansByProfile(tenantId)
  const candidates: Candidate[] = clients.map((c) => {
    const name = splitQueueName(pppClientName(c))
    return {
      row: {
        key: c.user,
        source: c.user,
        ip: c.ip,
        ...name,
        speed: c.profile,
        plan: plans.get(c.profile.toLowerCase())?.name ?? null,
        disabled: c.disabled,
        existing: byUser.get(c.user.toLowerCase()) ?? (c.ip ? byIp.get(c.ip) : undefined) ?? null,
      },
      customer: {
        ...name,
        phone: '',
        notes: [`Importado del usuario PPPoE «${c.user}» de ${router.name}.`, c.disabled ? 'El usuario está desactivado en el router.' : '', c.comment && c.comment !== pppClientName(c) ? c.comment : '']
          .filter(Boolean)
          .join(' '),
        status: 'ACTIVE',
        suspendExempt: false,
      },
      service: { mode: 'PPPoE', pppoeUser: c.user, pppoePassword: c.password, ipAddress: c.ip, discount: 0, syncRouter: false },
      planKey: c.profile.toLowerCase(),
    }
  })
  const ensurePlans = async (picked: Candidate[]) => {
    const wanted = [...new Map(picked.map((c) => [c.planKey, c.row.speed])).values()]
    return ensurePppPlans(tenantId, router.name, profiles, wanted)
  }
  const noPassword = clients.filter((c) => !c.password).length
  return { router, total: rows.length, ignored, candidates, ensurePlans, noPassword }
}

/** Vista previa: qué clientes se crearían y con qué plan. Solo lee. */
export async function previewRouterCustomers(routerId: string, kind: ImportKind): Promise<ImportPreview> {
  try {
    const user = await requireActionUser('customers')
    const r = await readCandidates(user.tenantId, routerId, kind)
    const rows = r.candidates.map((c) => c.row)
    const fresh = r.candidates.filter((c) => !c.row.existing)
    const newPlans = new Set(fresh.filter((c) => !c.row.plan).map((c) => c.planKey)).size
    return { ok: true, router: r.router.name, total: r.total, ignored: r.ignored, rows, newCount: fresh.length, newPlans, noPassword: r.noPassword }
  } catch (e) {
    return { ok: false, error: errorText(e) }
  }
}

export type ImportResult = { ok: true; message: string; errors: string[] } | { ok: false; error: string }

/**
 * Crea un cliente activo por cada cola o usuario PPPoE nuevo, con su servicio (plan según la
 * velocidad o el perfil, router, IP o usuario PPPoE). No escribe nada en el MikroTik: ya existe ahí.
 * Sin factura de instalación.
 */
export async function importRouterCustomers(routerId: string, kind: ImportKind, zoneId: string): Promise<ImportResult> {
  try {
    const user = await requireActionUser('customers')
    const zone = await prisma.zone.findFirst({ where: { id: zoneId, tenantId: user.tenantId } })
    if (!zone) throw new Error('Elige la zona de los clientes.')
    const r = await readCandidates(user.tenantId, routerId, kind)
    const pending = r.candidates.filter((c) => !c.row.existing)
    if (pending.length === 0) return { ok: true, message: 'No hay clientes nuevos: todos ya están en el sistema.', errors: [] }
    const batch = pending.slice(0, MAX_PER_RUN)
    const plans = await r.ensurePlans(batch)

    let created = 0
    const errors: string[] = []
    for (const c of batch) {
      const planId = plans.ids.get(c.planKey)
      if (!planId) continue
      try {
        await createCustomerWithService({
          tenantId: user.tenantId,
          userId: user.id,
          customer: { ...c.customer, zoneId: zone.id },
          service: { ...c.service, planId, routerId: r.router.id },
          invoice: null,
        })
        created++
      } catch (e) {
        errors.push(`${c.row.source}${c.row.ip ? ` (${c.row.ip})` : ''}: ${errorText(e)}`)
      }
    }
    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'customer.import',
      entity: 'Router',
      entityId: r.router.id,
      details: { source: kind === 'PPPOE' ? '/ppp/secret' : '/queue/simple', zone: zone.name, created, plansCreated: plans.created, errors: errors.length },
    })
    revalidatePath('/dashboard/plans')
    revalidatePath('/dashboard/customers')
    revalidatePath('/dashboard/settings')
    const left = pending.length - batch.length
    return {
      ok: true,
      message:
        `${created} cliente(s) importado(s) de ${r.router.name} a la zona ${zone.name}` +
        (plans.created ? `; ${plans.created} plan(es) nuevo(s) con precio $0, ponles precio` : '') +
        (errors.length ? `; ${errors.length} con error` : '') +
        (left > 0 ? `. Quedan ${left}: vuelve a importar para seguir` : '') +
        '.',
      errors: errors.slice(0, 20),
    }
  } catch (e) {
    return { ok: false, error: errorText(e) }
  }
}
