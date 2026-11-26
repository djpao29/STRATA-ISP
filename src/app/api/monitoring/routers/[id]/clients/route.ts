import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { RouterOSError } from '@/lib/mikrotik/client'
import { connectionFor } from '@/lib/mikrotik/connection'
import { getArp, getPppActive, getPppSecrets, getSimpleQueues } from '@/lib/mikrotik/routeros'
import { apiUser, noStore } from '@/lib/monitoring/api-auth'
import { cached } from '@/lib/monitoring/live-cache'
import { getMonitoringSettings } from '@/lib/monitoring/settings'

export const dynamic = 'force-dynamic'

/**
 * Clientes del sistema asignados a este router, con su estado real en el MikroTik:
 * sesiones PPPoE activas, perfil, IP, tiempo conectado y consumo (si hay colas simples).
 * Solo lectura: no desconecta ni modifica a nadie.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await apiUser('monitoring')
  if (error) return error

  const router = await prisma.router.findFirst({ where: { id: params.id, tenantId: user.tenantId } })
  if (!router) return NextResponse.json({ error: 'Router no encontrado' }, { status: 404 })

  const settings = await getMonitoringSettings(user.tenantId)
  try {
    const conn = connectionFor(router, settings.requestTimeoutSec)
    const live = await cached(`clients:${router.id}`, 15_000, async () => {
      const [active, secrets, queues, arp] = [await getPppActive(conn), await getPppSecrets(conn), await getSimpleQueues(conn), await getArp(conn)]
      return { active, secrets, queues, arp }
    })

    const services = await prisma.service.findMany({
      where: { routerId: router.id, tenantId: user.tenantId },
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, status: true } },
        plan: { select: { name: true, download: true, upload: true } },
      },
      orderBy: { customer: { lastName: 'asc' } },
    })

    const sessions = new Map((live.active ?? []).map((s) => [s.name, s]))
    const profiles = new Map(live.secrets.map((s) => [s.name, s]))
    const queueFor = (pppName: string | null, ip: string | null) =>
      live.queues.find((q) => (pppName && q.name === `<pppoe-${pppName}>`) || (ip && q.targets.includes(ip))) ?? null
    const arpByIp = new Map(live.arp.map((a) => [a.address, a]))

    const linkedPpp = new Set<string>()
    const clients = services.map((s) => {
      const base = {
        serviceId: s.id,
        customerId: s.customer.id,
        customer: `${s.customer.firstName} ${s.customer.lastName}`,
        customerStatus: s.customer.status,
        plan: s.plan.name,
        planSpeed: `${s.plan.download}/${s.plan.upload} Mbps`,
        mode: s.mode,
        serviceActive: s.isActive,
      }
      if (s.mode === 'PPPoE' && s.pppoeUser) {
        linkedPpp.add(s.pppoeUser)
        const session = sessions.get(s.pppoeUser)
        const q = queueFor(s.pppoeUser, session?.address ?? null)
        return {
          ...base,
          user: s.pppoeUser,
          online: !!session,
          address: session?.address ?? s.ipAddress,
          callerId: session?.callerId ?? null,
          uptimeSec: session?.uptimeSec ?? null,
          profile: profiles.get(s.pppoeUser)?.profile ?? null,
          lastLoggedOut: profiles.get(s.pppoeUser)?.lastLoggedOut ?? null,
          downBps: q?.downBps ?? null,
          upBps: q?.upBps ?? null,
          downBytes: q?.downBytes ?? null,
          upBytes: q?.upBytes ?? null,
          detection: live.active === null ? 'unavailable' : 'ppp',
        }
      }
      // IP estática / DHCP: presente si el router la tiene en ARP como alcanzable.
      const arp = s.ipAddress ? arpByIp.get(s.ipAddress) : undefined
      const q = queueFor(null, s.ipAddress)
      return {
        ...base,
        user: s.pppoeUser,
        online: s.ipAddress ? !!arp?.reachable : null,
        address: s.ipAddress,
        callerId: arp?.mac ?? null,
        uptimeSec: null,
        profile: null,
        lastLoggedOut: null,
        downBps: q?.downBps ?? null,
        upBps: q?.upBps ?? null,
        downBytes: q?.downBytes ?? null,
        upBytes: q?.upBytes ?? null,
        detection: s.ipAddress ? 'arp' : 'no_ip',
      }
    })

    // Sesiones PPPoE en el router que no corresponden a ningún servicio registrado.
    const unlinked = (live.active ?? [])
      .filter((s) => !linkedPpp.has(s.name))
      .map((s) => {
        const q = queueFor(s.name, s.address)
        return {
          user: s.name,
          address: s.address,
          callerId: s.callerId,
          uptimeSec: s.uptimeSec,
          service: s.service,
          profile: profiles.get(s.name)?.profile ?? null,
          downBps: q?.downBps ?? null,
          upBps: q?.upBps ?? null,
        }
      })

    return NextResponse.json(
      {
        at: new Date().toISOString(),
        pppAvailable: live.active !== null,
        queuesAvailable: live.queues.length > 0,
        totals: {
          activeSessions: live.active?.length ?? null,
          registered: clients.length,
          online: clients.filter((c) => c.online === true).length,
          offline: clients.filter((c) => c.online === false).length,
        },
        clients,
        unlinked,
      },
      noStore
    )
  } catch (e) {
    const message = e instanceof RouterOSError ? e.message : 'No se pudo consultar el router'
    if (!(e instanceof RouterOSError)) console.error('[monitoreo] clients', e)
    return NextResponse.json({ error: message }, { status: 502, ...noStore })
  }
}
