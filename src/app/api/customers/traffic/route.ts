import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { RouterOSError } from '@/lib/mikrotik/client'
import { apiUser, noStore } from '@/lib/monitoring/api-auth'
import { getMonitoringSettings } from '@/lib/monitoring/settings'
import { routerClients } from '@/lib/monitoring/clients'

export const dynamic = 'force-dynamic'

/**
 * Tráfico actual de todos los clientes, leído de todos los MikroTik con monitoreo activo.
 * Cada router se consulta por separado: si uno falla, los demás se muestran igual.
 */
export async function GET() {
  const { user, error } = await apiUser('monitoring')
  if (error) return error
  const settings = await getMonitoringSettings(user.tenantId)
  const routers = await prisma.router.findMany({
    where: { tenantId: user.tenantId, type: 'MIKROTIK', monitoringEnabled: true },
    orderBy: { name: 'asc' },
  })

  const results = await Promise.all(
    routers.map(async (r) => {
      try {
        const data = await routerClients(r, user.tenantId, settings.requestTimeoutSec)
        return { router: { id: r.id, name: r.name }, ok: true as const, ...data }
      } catch (e) {
        return { router: { id: r.id, name: r.name }, ok: false as const, error: e instanceof RouterOSError ? e.message : 'No se pudo consultar el router' }
      }
    })
  )

  const rows = results.flatMap((r) =>
    r.ok
      ? [
          ...r.clients.map((c) => ({ ...c, router: r.router.name, routerId: r.router.id, linked: true })),
          ...r.unlinked.map((u) => ({
            serviceId: `unlinked-${r.router.id}-${u.user}`,
            customerId: null,
            customerCode: null,
            customer: null,
            customerStatus: null,
            plan: u.profile,
            planSpeed: null,
            mode: 'PPPoE',
            user: u.user,
            online: true,
            address: u.address,
            callerId: u.callerId,
            uptimeSec: u.uptimeSec,
            downBps: u.downBps,
            upBps: u.upBps,
            downBytes: u.downBytes,
            upBytes: u.upBytes,
            router: r.router.name,
            routerId: r.router.id,
            linked: false,
          })),
        ]
      : []
  )

  return NextResponse.json(
    {
      at: new Date().toISOString(),
      routers: results.map((r) => ({ ...r.router, ok: r.ok, error: r.ok ? null : r.error, queues: r.ok ? r.queuesAvailable : false })),
      rows,
    },
    noStore
  )
}
