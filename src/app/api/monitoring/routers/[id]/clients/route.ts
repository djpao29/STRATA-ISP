import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { RouterOSError } from '@/lib/mikrotik/client'
import { apiUser, noStore } from '@/lib/monitoring/api-auth'
import { getMonitoringSettings } from '@/lib/monitoring/settings'
import { routerClients } from '@/lib/monitoring/clients'

export const dynamic = 'force-dynamic'

/** Clientes del sistema asignados a este router con su estado real en el MikroTik (solo lectura). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await apiUser('monitoring')
  if (error) return error

  const router = await prisma.router.findFirst({ where: { id: params.id, tenantId: user.tenantId } })
  if (!router) return NextResponse.json({ error: 'Router no encontrado' }, { status: 404 })

  const settings = await getMonitoringSettings(user.tenantId)
  try {
    const data = await routerClients(router, user.tenantId, settings.requestTimeoutSec)
    return NextResponse.json({ at: new Date().toISOString(), ...data }, noStore)
  } catch (e) {
    const message = e instanceof RouterOSError ? e.message : 'No se pudo consultar el router'
    if (!(e instanceof RouterOSError)) console.error('[monitoreo] clients', e)
    return NextResponse.json({ error: message }, { status: 502, ...noStore })
  }
}
