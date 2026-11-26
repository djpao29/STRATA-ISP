import type { MonitoringSettings, Router } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { RouterOSError } from '@/lib/mikrotik/client'
import { connectionFor } from '@/lib/mikrotik/connection'
import { getDefaultRouteInterfaces, getInterfaces, getPppActive, getSystemInfo } from '@/lib/mikrotik/routeros'
import { rateFromCounters } from '@/lib/mikrotik/parse'
import { computeAlerts, offlineAlert, type FiringAlert } from './alert-rules'
import { getMonitoringSettings } from './settings'

const ZERO = BigInt(0)

/** Tipos de interfaz cuyo historial se guarda por defecto. */
const MONITORED_BY_DEFAULT = new Set(['ether', 'pppoe-out', 'lte', 'wlan', 'wifi', 'bond', 'bridge'])

/** Sincroniza las alertas activas del router con las que deberían estarlo ahora. */
async function syncAlerts(router: Pick<Router, 'id' | 'tenantId'>, firing: FiringAlert[], keepKeys: (key: string) => boolean = () => false) {
  const active = await prisma.monitorAlert.findMany({ where: { routerId: router.id, status: 'ACTIVE' } })
  const firingKeys = new Set(firing.map((f) => f.key))

  for (const f of firing) {
    const existing = active.find((a) => a.key === f.key)
    if (existing) {
      if (existing.message !== f.message || existing.severity !== f.severity) {
        await prisma.monitorAlert.update({ where: { id: existing.id }, data: { message: f.message, severity: f.severity, value: f.value } })
      }
    } else {
      await prisma.monitorAlert.create({
        data: { tenantId: router.tenantId, routerId: router.id, key: f.key, severity: f.severity, message: f.message, value: f.value },
      })
    }
  }

  const toResolve = active.filter((a) => !firingKeys.has(a.key) && !keepKeys(a.key)).map((a) => a.id)
  if (toResolve.length) {
    await prisma.monitorAlert.updateMany({ where: { id: { in: toResolve } }, data: { status: 'RESOLVED', resolvedAt: new Date() } })
  }
  return firing.length
}

export type CollectResult = { ok: true; latencyMs: number; alerts: number } | { ok: false; error: string }

/**
 * Un ciclo de monitoreo de un router: lee el estado, guarda la muestra, actualiza interfaces
 * y evalúa las alertas. Nunca modifica nada en el router.
 */
export async function collectRouter(routerId: string, settingsArg?: MonitoringSettings): Promise<CollectResult> {
  const router = await prisma.router.findUnique({ where: { id: routerId } })
  if (!router) return { ok: false, error: 'Router no encontrado' }
  const settings = settingsArg ?? (await getMonitoringSettings(router.tenantId))
  const now = new Date()

  try {
    const conn = connectionFor(router, settings.requestTimeoutSec)
    const system = await getSystemInfo(conn)
    const ifaces = await getInterfaces(conn)
    const ppp = await getPppActive(conn)

    const known = await prisma.routerInterface.findMany({ where: { routerId } })
    const byName = new Map(known.map((k) => [k.name, k]))
    const hasWan = known.some((k) => k.role === 'WAN')
    // La WAN se detecta por la ruta por defecto la primera vez; después la decide el usuario.
    const wanNames = hasWan ? [] : await getDefaultRouteInterfaces(conn)

    let wanRx = ZERO
    let wanTx = ZERO
    let wanSeen = false
    const samples: Array<{ interfaceId: string; rxBps: bigint; txBps: bigint }> = []

    for (const i of ifaces) {
      const prev = byName.get(i.name)
      const rxBps = prev ? rateFromCounters(prev.rxBytes, prev.sampledAt, i.rxBytes, now) : null
      const txBps = prev ? rateFromCounters(prev.txBytes, prev.sampledAt, i.txBytes, now) : null
      const common = {
        type: i.type,
        comment: i.comment,
        running: i.running,
        disabled: i.disabled,
        isSfp: i.isSfp,
        rxBytes: i.rxBytes,
        txBytes: i.txBytes,
        rxBps: rxBps ?? ZERO,
        txBps: txBps ?? ZERO,
        sampledAt: now,
        missing: false,
      }

      let saved
      if (prev) {
        saved = await prisma.routerInterface.update({ where: { id: prev.id }, data: common })
      } else {
        const isWan = wanNames.includes(i.name)
        saved = await prisma.routerInterface.create({
          data: {
            ...common,
            routerId,
            name: i.name,
            role: isWan ? 'WAN' : 'OTHER',
            monitored: isWan || i.isSfp || MONITORED_BY_DEFAULT.has(i.type),
            // Alertar si se cae: la WAN siempre; los SFP solo si estaban con enlace al descubrirlos.
            alertOnDown: isWan || (i.isSfp && i.running),
          },
        })
      }

      if (saved.role === 'WAN') {
        wanSeen = true
        wanRx += rxBps ?? ZERO
        wanTx += txBps ?? ZERO
      }
      if (saved.monitored && rxBps !== null && txBps !== null) samples.push({ interfaceId: saved.id, rxBps, txBps })
    }

    // Interfaces que desaparecieron del router (p. ej. una pppoe-out caída se borra sola).
    const present = new Set(ifaces.map((i) => i.name))
    const gone = known.filter((k) => !present.has(k.name)).map((k) => k.id)
    if (gone.length) {
      await prisma.routerInterface.updateMany({ where: { id: { in: gone } }, data: { missing: true, running: false, rxBps: ZERO, txBps: ZERO } })
    }
    if (samples.length) await prisma.interfaceSample.createMany({ data: samples.map((s) => ({ ...s, at: now })) })

    const memUsed = system.memTotal - system.memFree
    const hddUsed = system.hddTotal - system.hddFree
    await prisma.routerMetric.create({
      data: {
        routerId,
        at: now,
        latencyMs: system.latencyMs,
        cpuLoad: system.cpuLoad,
        memUsed,
        memTotal: system.memTotal,
        hddUsed,
        hddTotal: system.hddTotal,
        temperature: system.temperature,
        voltage: system.voltage,
        uptimeSec: system.uptimeSec,
        pppActive: ppp ? ppp.length : null,
        wanRxBps: wanSeen ? wanRx : null,
        wanTxBps: wanSeen ? wanTx : null,
      },
    })

    const interfaces = await prisma.routerInterface.findMany({ where: { routerId } })
    const firing = computeAlerts(
      {
        cpuLoad: system.cpuLoad,
        memUsedPct: system.memTotal > ZERO ? (Number(memUsed) / Number(system.memTotal)) * 100 : 0,
        temperature: system.temperature,
        latencyMs: system.latencyMs,
      },
      interfaces,
      settings
    )
    const alertCount = await syncAlerts(router, firing)

    await prisma.router.update({
      where: { id: routerId },
      data: {
        status: alertCount > 0 ? 'DEGRADED' : 'ONLINE',
        identity: system.identity,
        model: system.model,
        osVersion: system.osVersion,
        latencyMs: system.latencyMs,
        lastSeenAt: now,
        lastCheckedAt: now,
        lastError: null,
        failCount: 0,
      },
    })
    return { ok: true, latencyMs: system.latencyMs, alerts: alertCount }
  } catch (error) {
    const message = error instanceof RouterOSError ? error.message : error instanceof Error ? error.message : String(error)
    if (!(error instanceof RouterOSError)) console.error(`[monitoreo] ${router.name}:`, error)

    const failCount = router.failCount + 1
    const offline = failCount >= settings.offlineAfterFails
    await prisma.router.update({
      where: { id: routerId },
      data: {
        failCount,
        lastError: message,
        lastCheckedAt: now,
        ...(offline ? { status: 'OFFLINE' } : {}),
      },
    })
    // Mientras no hay datos se mantienen las demás alertas abiertas: no sabemos si se resolvieron.
    if (offline) await syncAlerts(router, [offlineAlert(message)], (key) => key !== 'offline')
    return { ok: false, error: message }
  }
}
