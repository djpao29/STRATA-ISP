// Conversión de las respuestas de la API REST de RouterOS: todos los valores llegan como texto.

export type RosRecord = Record<string, string | undefined>

export function toInt(value: string | undefined, fallback = 0): number {
  if (value === undefined || value === '') return fallback
  const n = Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : fallback
}

export function toFloat(value: string | undefined): number | null {
  if (value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function toBool(value: string | undefined): boolean {
  return value === 'true' || value === 'yes'
}

/** "1w2d3h4m5s", "3d18h29m46s", "45s" o "00:12:34" → segundos. */
export function parseUptime(value: string | undefined): number {
  if (!value) return 0
  const clock = /^(\d+):(\d{2}):(\d{2})$/.exec(value)
  if (clock) return Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3])
  const units: Record<string, number> = { w: 604800, d: 86400, h: 3600, m: 60, s: 1 }
  let total = 0
  for (const [, n, unit] of value.matchAll(/(\d+)([wdhms])/g)) total += Number(n) * units[unit]
  return total
}

/** "1000/2000" (subida/bajada en colas simples) → [1000, 2000]. */
export function parsePair(value: string | undefined): [number, number] {
  const [a, b] = (value ?? '').split('/')
  return [toInt(a), toInt(b)]
}

/**
 * /system/health: RouterOS 7 devuelve una lista [{name, value, type}];
 * RouterOS 6 devolvía un objeto plano. Se aceptan ambos.
 */
export function parseHealth(data: unknown): { temperature: number | null; voltage: number | null } {
  const entries: Array<[string, string | undefined]> = Array.isArray(data)
    ? (data as RosRecord[]).map((r) => [r.name ?? '', r.value])
    : Object.entries((data ?? {}) as RosRecord)
  const find = (names: string[]) => {
    for (const name of names) {
      const hit = entries.find(([n]) => n === name)
      const v = toFloat(hit?.[1])
      if (v !== null) return v
    }
    return null
  }
  const temperature =
    find(['cpu-temperature', 'temperature', 'board-temperature1', 'board-temperature']) ??
    (() => {
      // Cualquier otro sensor de temperatura disponible: se toma el más alto.
      const temps = entries.filter(([n]) => n.includes('temperature')).map(([, v]) => toFloat(v)).filter((v): v is number => v !== null)
      return temps.length ? Math.max(...temps) : null
    })()
  const voltage = find(['voltage', 'psu1-voltage', 'psu2-voltage'])
  return { temperature, voltage }
}

/** Interfaz de salida de la ruta por defecto: "192.168.1.1%ether1" → "ether1"; "pppoe-out1" → "pppoe-out1". */
export function routeInterface(route: RosRecord): string | null {
  const gw = route['immediate-gw'] || route.gateway || ''
  if (!gw) return null
  if (gw.includes('%')) return gw.split('%').pop() || null
  // Si la puerta de enlace no es una IP, es el nombre de una interfaz.
  return /^[\d.:a-fA-F]+$/.test(gw) ? null : gw
}

export function isSfpInterface(i: RosRecord) {
  return /sfp/i.test(i.name ?? '') || /sfp/i.test(i['default-name'] ?? '')
}

/** Tasa en bits por segundo a partir de dos lecturas de contador de bytes. Reinicio de contador → null. */
export function rateFromCounters(prevBytes: bigint, prevAt: Date | null, nowBytes: bigint, now: Date): bigint | null {
  if (!prevAt) return null
  const seconds = (now.getTime() - prevAt.getTime()) / 1000
  if (seconds <= 0 || nowBytes < prevBytes) return null
  return BigInt(Math.round((Number(nowBytes - prevBytes) * 8) / seconds))
}
