import { rosGet, rosGetOptional, rosRequest, type RouterConnection } from './client'
import {
  isSfpInterface,
  parseHealth,
  parsePair,
  parseUptime,
  routeInterface,
  toBool,
  toInt,
  type RosRecord,
} from './parse'

// Lecturas de alto nivel. Todas son de solo lectura y no afectan a los clientes conectados.

export type SystemInfo = {
  identity: string | null
  model: string | null
  osVersion: string
  architecture: string | null
  uptimeSec: number
  cpuLoad: number
  cpuCount: number
  cpuCores: Array<{ name: string; load: number }>
  memTotal: bigint
  memFree: bigint
  hddTotal: bigint
  hddFree: bigint
  temperature: number | null
  voltage: number | null
  latencyMs: number
}

export async function getSystemInfo(conn: RouterConnection): Promise<SystemInfo> {
  const started = Date.now()
  const resource = await rosGet<RosRecord>(conn, '/system/resource')
  const latencyMs = Date.now() - started

  // Opcionales: dependen del modelo (CHR y x86 no tienen routerboard ni sensores).
  const [identity, routerboard, health, cores] = await Promise.all([
    rosGetOptional<RosRecord>(conn, '/system/identity'),
    rosGetOptional<RosRecord>(conn, '/system/routerboard', ['model', 'routerboard']),
    rosGetOptional<unknown>(conn, '/system/health'),
    rosGetOptional<RosRecord[]>(conn, '/system/resource/cpu', ['cpu', 'load']),
  ])

  const { temperature, voltage } = parseHealth(health)
  return {
    identity: identity?.name ?? null,
    model: (routerboard?.model && routerboard.model !== '') ? routerboard.model : resource['board-name'] ?? null,
    osVersion: resource.version ?? 'desconocida',
    architecture: resource['architecture-name'] ?? null,
    uptimeSec: parseUptime(resource.uptime),
    cpuLoad: toInt(resource['cpu-load']),
    cpuCount: toInt(resource['cpu-count'], 1),
    cpuCores: (cores ?? []).map((c) => ({ name: c.cpu ?? '', load: toInt(c.load) })),
    memTotal: BigInt(toInt(resource['total-memory'])),
    memFree: BigInt(toInt(resource['free-memory'])),
    hddTotal: BigInt(toInt(resource['total-hdd-space'])),
    hddFree: BigInt(toInt(resource['free-hdd-space'])),
    temperature,
    voltage,
    latencyMs,
  }
}

export type InterfaceInfo = {
  name: string
  type: string
  comment: string | null
  running: boolean
  disabled: boolean
  isSfp: boolean
  rxBytes: bigint
  txBytes: bigint
}

export async function getInterfaces(conn: RouterConnection): Promise<InterfaceInfo[]> {
  const list = await rosGet<RosRecord[]>(conn, '/interface', [
    'name',
    'default-name',
    'type',
    'comment',
    'running',
    'disabled',
    'rx-byte',
    'tx-byte',
  ])
  return list.map((i) => ({
    name: i.name ?? '',
    type: i.type ?? '',
    comment: i.comment || null,
    running: toBool(i.running),
    disabled: toBool(i.disabled),
    isSfp: isSfpInterface(i),
    rxBytes: BigInt(toInt(i['rx-byte'])),
    txBytes: BigInt(toInt(i['tx-byte'])),
  }))
}

/** Interfaces de salida de las rutas por defecto activas (candidatas a WAN). */
export async function getDefaultRouteInterfaces(conn: RouterConnection): Promise<string[]> {
  const routes = await rosGetOptional<RosRecord[]>(conn, '/ip/route', ['dst-address', 'gateway', 'immediate-gw', 'active', 'disabled'])
  return Array.from(
    new Set(
      (routes ?? [])
        .filter((r) => r['dst-address'] === '0.0.0.0/0' && toBool(r.active) && !toBool(r.disabled))
        .map(routeInterface)
        .filter((n): n is string => !!n)
    )
  )
}

/** Velocidad instantánea por interfaz (comando monitor-traffic con "once"). */
export async function monitorTraffic(conn: RouterConnection, names: string[]) {
  if (names.length === 0) return []
  const rows = await rosRequest<RosRecord[]>(conn, 'POST', '/interface/monitor-traffic', {
    body: { interface: names.join(','), once: '', '.proplist': 'name,rx-bits-per-second,tx-bits-per-second' },
  })
  return (rows ?? []).map((r) => ({
    name: r.name ?? '',
    rxBps: toInt(r['rx-bits-per-second']),
    txBps: toInt(r['tx-bits-per-second']),
  }))
}

export type PppSession = { name: string; service: string; address: string | null; callerId: string | null; uptimeSec: number }

export async function getPppActive(conn: RouterConnection): Promise<PppSession[] | null> {
  const rows = await rosGetOptional<RosRecord[]>(conn, '/ppp/active', ['name', 'service', 'address', 'caller-id', 'uptime'])
  if (!rows) return null
  return rows.map((r) => ({
    name: r.name ?? '',
    service: r.service ?? '',
    address: r.address || null,
    callerId: r['caller-id'] || null,
    uptimeSec: parseUptime(r.uptime),
  }))
}

/** Usuarios PPP (sin contraseña: no se pide el campo). */
export async function getPppSecrets(conn: RouterConnection) {
  const rows = await rosGetOptional<RosRecord[]>(conn, '/ppp/secret', ['name', 'profile', 'service', 'disabled', 'last-logged-out'])
  return (rows ?? []).map((r) => ({
    name: r.name ?? '',
    profile: r.profile ?? null,
    disabled: toBool(r.disabled),
    lastLoggedOut: r['last-logged-out'] || null,
  }))
}

/** Colas simples: velocidad actual y bytes acumulados (subida/bajada del cliente). */
export async function getSimpleQueues(conn: RouterConnection) {
  const rows = await rosGetOptional<RosRecord[]>(conn, '/queue/simple', ['name', 'target', 'rate', 'bytes', 'max-limit', 'disabled'])
  return (rows ?? []).map((r) => {
    const [upBps, downBps] = parsePair(r.rate)
    const [upBytes, downBytes] = parsePair(r.bytes)
    const [maxUp, maxDown] = parsePair(r['max-limit'])
    return {
      name: r.name ?? '',
      targets: (r.target ?? '').split(',').map((t) => t.trim().replace(/\/32$/, '')).filter(Boolean),
      upBps,
      downBps,
      upBytes,
      downBytes,
      maxUp,
      maxDown,
      disabled: toBool(r.disabled),
    }
  })
}

/** Tabla ARP: sirve para saber si un cliente con IP estática está presente en la red. */
export async function getArp(conn: RouterConnection) {
  const rows = await rosGetOptional<RosRecord[]>(conn, '/ip/arp', ['address', 'mac-address', 'interface', 'complete', 'disabled', 'status'])
  return (rows ?? [])
    .filter((r) => !toBool(r.disabled))
    .map((r) => ({
      address: r.address ?? '',
      mac: r['mac-address'] || null,
      iface: r.interface ?? '',
      // RouterOS 7 informa "status" (reachable, stale, failed...); versiones anteriores, "complete".
      reachable: r.status ? !['failed', 'incomplete'].includes(r.status) : r.complete === undefined || toBool(r.complete),
    }))
}
