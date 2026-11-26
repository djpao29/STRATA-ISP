import { rosGet, rosGetOptional, rosWrite, RouterOSError, type RouterConnection } from './client'
import type { RosRecord } from './parse'

/**
 * Planes en RouterOS:
 * - PPPoE: el plan es un perfil en /ppp/profile cuyo rate-limit fija la velocidad; cada cliente
 *   (usuario en /ppp/secret) usa ese perfil.
 * - Simple Queue: cada cliente tiene una cola en /queue/simple con target = su IP.
 * En MikroTik los pares van en orden subida/bajada del cliente (rx/tx del router).
 */

const UNITS: Record<string, number> = { '': 1, k: 1e3, K: 1e3, m: 1e6, M: 1e6, g: 1e9, G: 1e9 }

/** "10M", "512k", "1G", "2000000" → bits por segundo. null si no se entiende. */
export function parseRate(value: string | undefined): number | null {
  const m = /^\s*(\d+(?:\.\d+)?)\s*([kKmMgG]?)\s*$/.exec(value ?? '')
  if (!m) return null
  return Math.round(Number(m[1]) * UNITS[m[2]])
}

/** rate-limit de un perfil PPP ("10M/20M 15M/25M ...") → Mbps de subida y bajada (enteros). */
export function parseRateLimit(value: string | undefined): { upload: number; download: number } {
  const first = (value ?? '').trim().split(/\s+/)[0] ?? ''
  const [up, down] = first.split('/')
  const toMbps = (v: string | undefined) => {
    const bps = parseRate(v)
    return bps == null ? 0 : Math.max(0, Math.round(bps / 1e6))
  }
  const upload = toMbps(up)
  return { upload, download: down === undefined ? upload : toMbps(down) }
}

const PAIR = String.raw`\d+(?:\.\d+)?[kKmMgG]?\/\d+(?:\.\d+)?[kKmMgG]?`

/** Burst de cola simple: "límite umbral tiempo", cada par subida/bajada; tiempo en segundos (uno o par). */
export function parseBurst(value: string | null | undefined) {
  const v = (value ?? '').trim()
  if (!v) return null
  const m = new RegExp(`^(${PAIR})\\s+(${PAIR})\\s+(\\d{1,4})(?:s)?(?:\\/(\\d{1,4})s?)?$`).exec(v)
  if (!m) return null
  const t1 = m[3]
  const t2 = m[4] ?? m[3]
  return { burstLimit: m[1], burstThreshold: m[2], burstTime: `${t1}s/${t2}s` }
}

export const BURST_FORMAT_HINT = 'Formato MikroTik subida/bajada: límite umbral tiempo. Ej. 20M/5M 15M/4M 10'

export type PlanSpeed = { name: string; upload: number; download: number; burst?: string | null; priorityUp?: number; priorityDown?: number }

export function rateLimitFor(p: Pick<PlanSpeed, 'upload' | 'download'>) {
  return `${p.upload}M/${p.download}M`
}

export async function getPppProfiles(conn: RouterConnection) {
  const rows = await rosGetOptional<RosRecord[]>(conn, '/ppp/profile', ['.id', 'name', 'rate-limit', 'default'])
  if (rows === null) throw new RouterOSError('Este router no tiene el menú /ppp/profile (¿falta el paquete PPP?).', 'not_found')
  return rows.map((r) => ({ id: r['.id'] ?? '', name: r.name ?? '', rateLimit: r['rate-limit'] || null, isDefault: r.default === 'true' }))
}

/** Crea el perfil PPP si no existe o ajusta su rate-limit. Devuelve qué hizo. */
export async function ensurePppProfile(conn: RouterConnection, profile: string, plan: Pick<PlanSpeed, 'upload' | 'download'>) {
  const rateLimit = rateLimitFor(plan)
  const rows = await rosGet<RosRecord[]>(conn, '/ppp/profile', ['.id', 'name', 'rate-limit'], { name: profile })
  const current = rows.find((r) => r.name === profile)
  if (!current) {
    await rosWrite(conn, 'PUT', '/ppp/profile', { name: profile, 'rate-limit': rateLimit, comment: 'wispx' })
    return 'created' as const
  }
  if (current['rate-limit'] !== rateLimit && current['.id']) {
    await rosWrite(conn, 'PATCH', `/ppp/profile/${current['.id']}`, { 'rate-limit': rateLimit })
    return 'updated' as const
  }
  return 'unchanged' as const
}

/** Asigna el perfil al usuario PPPoE del cliente (la velocidad nueva aplica al reconectar). */
export async function setSecretProfile(conn: RouterConnection, user: string, profile: string) {
  const rows = await rosGet<RosRecord[]>(conn, '/ppp/secret', ['.id', 'name', 'profile'], { name: user })
  const secret = rows.find((r) => r.name === user)
  if (!secret?.['.id']) return 'missing' as const
  if (secret.profile === profile) return 'unchanged' as const
  await rosWrite(conn, 'PATCH', `/ppp/secret/${secret['.id']}`, { profile })
  return 'updated' as const
}

/** Crea o ajusta la cola simple del cliente (target = su IP). */
export async function ensureClientQueue(conn: RouterConnection, client: { name: string; ip: string }, plan: PlanSpeed) {
  const burst = parseBurst(plan.burst)
  const desired: Record<string, string> = {
    'max-limit': rateLimitFor(plan),
    priority: `${plan.priorityUp ?? 8}/${plan.priorityDown ?? 8}`,
    'burst-limit': burst?.burstLimit ?? '0/0',
    'burst-threshold': burst?.burstThreshold ?? '0/0',
    'burst-time': burst?.burstTime ?? '0s/0s',
  }
  const rows = await rosGet<RosRecord[]>(conn, '/queue/simple', ['.id', 'name', 'target', 'dynamic', ...Object.keys(desired)])
  const queue = rows.find(
    (r) => r.dynamic !== 'true' && (r.target ?? '').split(',').some((t) => t.trim().replace(/\/32$/, '') === client.ip)
  )
  if (!queue) {
    await rosWrite(conn, 'PUT', '/queue/simple', { name: client.name, target: `${client.ip}/32`, comment: 'wispx', ...desired })
    return 'created' as const
  }
  const norm = (k: string, v: string | undefined) => (k === 'burst-time' ? (v ?? '').replace(/s/g, '') : v ?? '')
  const changes = Object.fromEntries(Object.entries(desired).filter(([k, v]) => norm(k, queue[k]) !== norm(k, v)))
  if (Object.keys(changes).length && queue['.id']) {
    await rosWrite(conn, 'PATCH', `/queue/simple/${queue['.id']}`, changes)
    return 'updated' as const
  }
  return 'unchanged' as const
}

/** Crea el usuario PPPoE del cliente (o, si ya existe, le asigna el perfil). Nunca cambia la clave de uno existente. */
export async function ensurePppSecret(
  conn: RouterConnection,
  secret: { name: string; password: string | null; profile: string; remoteAddress?: string | null; comment: string }
) {
  const rows = await rosGet<RosRecord[]>(conn, '/ppp/secret', ['.id', 'name', 'profile'], { name: secret.name })
  const current = rows.find((r) => r.name === secret.name)
  if (current) {
    if (current.profile !== secret.profile && current['.id']) {
      await rosWrite(conn, 'PATCH', `/ppp/secret/${current['.id']}`, { profile: secret.profile })
      return 'updated' as const
    }
    return 'unchanged' as const
  }
  if (!secret.password) throw new RouterOSError(`El usuario PPPoE "${secret.name}" no existe en el router y no se indicó clave para crearlo.`, 'bad_request')
  await rosWrite(conn, 'PUT', '/ppp/secret', {
    name: secret.name,
    password: secret.password,
    profile: secret.profile,
    service: 'pppoe',
    comment: secret.comment.slice(0, 120),
    ...(secret.remoteAddress ? { 'remote-address': secret.remoteAddress } : {}),
  })
  return 'created' as const
}

/** Leases del servidor DHCP (solo lectura). */
export async function getDhcpLeases(conn: RouterConnection) {
  const rows = await rosGetOptional<RosRecord[]>(conn, '/ip/dhcp-server/lease', ['address', 'mac-address', 'host-name', 'status', 'dynamic', 'comment', 'server'])
  return (rows ?? [])
    .filter((r) => r.address)
    .map((r) => ({
      address: r.address ?? '',
      mac: r['mac-address'] || null,
      hostName: r['host-name'] || null,
      status: r.status || null,
      dynamic: r.dynamic === 'true',
      comment: r.comment || null,
      server: r.server || null,
    }))
}
