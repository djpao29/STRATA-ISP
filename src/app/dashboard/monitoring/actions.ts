'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireActionUser } from '@/lib/session'
import { audit } from '@/lib/audit'
import { formToObject, requiredNumber, toActionError, type ActionState } from '@/lib/actions'
import { collectNow } from '@/lib/monitoring/scheduler'

/** Consulta el router ahora mismo (sin esperar al siguiente ciclo). */
export async function refreshRouter(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('monitoring')
    const id = z.string().parse(formData.get('id'))
    const router = await prisma.router.findFirst({ where: { id, tenantId: user.tenantId }, select: { id: true, name: true } })
    if (!router) throw new Error('El router no existe.')
    const result = await collectNow(router.id)
    revalidatePath(`/dashboard/monitoring/${router.id}`)
    if (!result.ok) return { error: `${router.name}: ${result.error}` }
    return { ok: true, message: `${router.name} actualizado (${result.latencyMs} ms)` }
  } catch (error) {
    return toActionError(error)
  }
}

export async function updateInterface(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('monitoring')
    const data = z
      .object({
        id: z.string(),
        role: z.enum(['WAN', 'LAN', 'OTHER']),
        monitored: z.literal('on').optional(),
        alertOnDown: z.literal('on').optional(),
      })
      .parse(formToObject(formData))
    const iface = await prisma.routerInterface.findFirst({ where: { id: data.id, router: { tenantId: user.tenantId } } })
    if (!iface) throw new Error('La interfaz no existe.')
    await prisma.routerInterface.update({
      where: { id: iface.id },
      data: { role: data.role, monitored: data.monitored === 'on', alertOnDown: data.alertOnDown === 'on' },
    })
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'monitoring.interface', entity: 'RouterInterface', entityId: iface.id, details: { name: iface.name, role: data.role } })
    revalidatePath(`/dashboard/monitoring/${iface.routerId}`)
    return { ok: true, message: `${iface.name} actualizada` }
  } catch (error) {
    return toActionError(error)
  }
}

export async function toggleMonitoring(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('monitoringSettings')
    const id = z.string().parse(formData.get('id'))
    const router = await prisma.router.findFirst({ where: { id, tenantId: user.tenantId } })
    if (!router) throw new Error('El router no existe.')
    await prisma.router.update({ where: { id }, data: { monitoringEnabled: !router.monitoringEnabled } })
    revalidatePath('/dashboard/monitoring')
    return { ok: true, message: router.monitoringEnabled ? 'Monitoreo pausado' : 'Monitoreo activado' }
  } catch (error) {
    return toActionError(error)
  }
}

export async function saveMonitoringSettings(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('monitoringSettings')
    const n = (min: number, max: number) => requiredNumber((x) => x.int('Número entero').min(min, `Mínimo ${min}`).max(max, `Máximo ${max}`))
    const data = z
      .object({
        pollIntervalSec: n(15, 3600),
        liveRefreshSec: n(2, 60),
        requestTimeoutSec: n(2, 55),
        cpuThreshold: n(10, 100),
        memThreshold: n(10, 100),
        tempThreshold: n(30, 120),
        latencyThreshold: n(50, 60000),
        offlineAfterFails: n(1, 10),
        retentionDays: n(1, 90),
      })
      .parse(formToObject(formData))
    await prisma.monitoringSettings.upsert({ where: { tenantId: user.tenantId }, update: data, create: { ...data, tenantId: user.tenantId } })
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'monitoring.settings', entity: 'MonitoringSettings', details: data })
    revalidatePath('/dashboard/monitoring', 'layout')
    return { ok: true, message: 'Ajustes de monitoreo guardados' }
  } catch (error) {
    return toActionError(error)
  }
}
