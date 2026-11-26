'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireActionUser } from '@/lib/session'
import { audit } from '@/lib/audit'
import { encrypt } from '@/lib/crypto'
import { HOST_REGEX, tcpCheck } from '@/lib/net'
import { formToObject, toActionError, type ActionState } from '@/lib/actions'
import { connectionFor } from '@/lib/mikrotik/connection'
import { getSystemInfo } from '@/lib/mikrotik/routeros'
import { RouterOSError } from '@/lib/mikrotik/client'
import { formatUptime } from '@/lib/monitoring/units'

const fields = z.object({
  name: z.string({ required_error: 'Obligatorio' }).max(100),
  host: z.string({ required_error: 'Obligatorio' }).regex(HOST_REGEX, 'IP o nombre de host inválido'),
  port: z.coerce.number().int().min(1).max(65535).default(443),
  username: z.string({ required_error: 'Obligatorio' }).max(100),
  type: z.enum(['MIKROTIK', 'CISCO', 'JUNIPER', 'GENERIC']).default('MIKROTIK'),
  useHttps: z.literal('on').optional(),
  verifyTls: z.literal('on').optional(),
  monitoringEnabled: z.literal('on').optional(),
})

/** Las casillas sin marcar no llegan en el formulario: se convierten a booleanos. */
function normalize<T extends z.infer<typeof fields>>({ useHttps, verifyTls, monitoringEnabled, ...rest }: T) {
  return { ...rest, useHttps: useHttps === 'on', verifyTls: verifyTls === 'on', monitoringEnabled: monitoringEnabled === 'on' }
}

export async function createRouter(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('routers')
    const { password, ...rest } = normalize(
      fields.extend({ password: z.string({ required_error: 'Obligatorio' }).max(200) }).parse(formToObject(formData))
    )
    const router = await prisma.router.create({ data: { ...rest, passwordEnc: encrypt(password), tenantId: user.tenantId } })
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'router.create', entity: 'Router', entityId: router.id })
  } catch (error) {
    return toActionError(error)
  }
  revalidatePath('/dashboard/routers')
  redirect('/dashboard/routers')
}

export async function updateRouter(id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('routers')
    const { password, ...rest } = normalize(fields.extend({ password: z.string().max(200).optional() }).parse(formToObject(formData)))
    const router = await prisma.router.findFirst({ where: { id, tenantId: user.tenantId } })
    if (!router) throw new Error('El router no existe.')
    await prisma.router.update({
      where: { id },
      // Contraseña vacía = conservar la actual. Al cambiar la conexión se reinicia el contador de fallos.
      data: { ...rest, failCount: 0, ...(password ? { passwordEnc: encrypt(password) } : {}) },
    })
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'router.update', entity: 'Router', entityId: id })
  } catch (error) {
    return toActionError(error)
  }
  revalidatePath('/dashboard/routers')
  redirect('/dashboard/routers')
}

export async function deleteRouter(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('routers')
    const id = z.string().parse(formData.get('id'))
    const router = await prisma.router.findFirst({ where: { id, tenantId: user.tenantId }, include: { _count: { select: { services: true } } } })
    if (!router) throw new Error('El router no existe.')
    if (router._count.services > 0) throw new Error('Hay servicios asignados a este router. Reasígnalos antes de eliminarlo.')
    await prisma.router.delete({ where: { id } })
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'router.delete', entity: 'Router', entityId: id })
    revalidatePath('/dashboard/routers')
    return { ok: true, message: 'Router eliminado' }
  } catch (error) {
    return toActionError(error)
  }
}

/**
 * MikroTik: consulta real a la API REST (/system/resource) y guarda modelo y versión.
 * Otros equipos: comprueba que el puerto acepte conexiones TCP.
 */
export async function testRouter(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('routers')
    const id = z.string().parse(formData.get('id'))
    const router = await prisma.router.findFirst({ where: { id, tenantId: user.tenantId } })
    if (!router) throw new Error('El router no existe.')

    if (router.type !== 'MIKROTIK') {
      const result = await tcpCheck(router.host, router.port)
      await prisma.router.update({ where: { id }, data: { status: result.ok ? 'ONLINE' : 'OFFLINE', lastCheckedAt: new Date() } })
      revalidatePath('/dashboard/routers')
      return result.ok
        ? { ok: true, message: `${router.name}: puerto accesible (${result.ms} ms)` }
        : { error: `${router.name}: sin respuesta en ${router.host}:${router.port} (${result.error})` }
    }

    try {
      const info = await getSystemInfo(connectionFor(router))
      await prisma.router.update({
        where: { id },
        data: {
          status: 'ONLINE',
          identity: info.identity,
          model: info.model,
          osVersion: info.osVersion,
          latencyMs: info.latencyMs,
          lastSeenAt: new Date(),
          lastCheckedAt: new Date(),
          lastError: null,
          failCount: 0,
        },
      })
      revalidatePath('/dashboard/routers')
      return {
        ok: true,
        message: `${router.name}: ${info.model ?? 'MikroTik'} · RouterOS ${info.osVersion} · activo ${formatUptime(info.uptimeSec)} (${info.latencyMs} ms)`,
      }
    } catch (error) {
      if (!(error instanceof RouterOSError)) throw error
      await prisma.router.update({ where: { id }, data: { status: 'OFFLINE', lastCheckedAt: new Date(), lastError: error.message } })
      revalidatePath('/dashboard/routers')
      return { error: `${router.name}: ${error.message}` }
    }
  } catch (error) {
    return toActionError(error)
  }
}
