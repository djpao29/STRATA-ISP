import type { OltBrand, ONUStatus } from '@prisma/client'
import { runCli, type CliTarget } from './cli'
import type { Discovery, OnuReading } from './drivers'

/**
 * Lectura de OLTs por consola (Telnet/SSH) con plantillas de comandos editables, para marcas cuyos
 * comandos cambian según modelo y firmware (Hioso, C-Data, BDCOM, VSOL). El lector es tolerante:
 * en cada línea busca el identificador de la ONU (serial GPON o MAC EPON), su posición PON, el estado
 * y la señal, sin depender de las columnas exactas de cada firmware.
 */

// ── Identificadores ─────────────────────────────────────────────────────────

const MAC_RE = /\b([0-9a-f]{2}[:-]){5}[0-9a-f]{2}\b|\b[0-9a-f]{4}\.[0-9a-f]{4}\.[0-9a-f]{4}\b/i
const SN_RE = /\b[A-Z]{4}[0-9A-F]{8}\b/i

/** Serial GPON ("HWTC1A2B3C4D") o MAC EPON en cualquier formato → forma única ("AA:BB:CC:DD:EE:FF"). */
export function normalizeOnuId(value: string): string | null {
  const v = value.trim()
  const hex = v.replace(/[:.\-\s]/g, '')
  if (/^[0-9a-f]{12}$/i.test(hex) && (/^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(v) || /^[0-9a-f]{4}\.[0-9a-f]{4}\.[0-9a-f]{4}$/i.test(v) || /^[0-9a-f]{12}$/i.test(v))) {
    return hex.toUpperCase().match(/.{2}/g)!.join(':')
  }
  if (/^[A-Za-z0-9]{8,16}$/.test(v)) return v.toUpperCase()
  return null
}

export const isMac = (id: string) => /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(id)

/** Variantes de la MAC para las plantillas (cada marca la escribe distinto). */
export function macForms(id: string) {
  if (!isMac(id)) return { mac: id, macDot: id, macDash: id, macPlain: id }
  const plain = id.replace(/:/g, '').toLowerCase()
  return {
    mac: id,
    macDot: `${plain.slice(0, 4)}.${plain.slice(4, 8)}.${plain.slice(8)}`,
    macDash: id.replace(/:/g, '-'),
    macPlain: plain,
  }
}

function findId(line: string) {
  const mac = MAC_RE.exec(line)
  if (mac) return { raw: mac[0], id: normalizeOnuId(mac[0])! }
  const sn = SN_RE.exec(line)
  if (sn) return { raw: sn[0], id: sn[0].toUpperCase() }
  return null
}

// ── Posición PON ────────────────────────────────────────────────────────────

/** Posición de la ONU en la línea: slot, puerto e ID (si lo trae). */
export function findPosition(line: string): { slot: number; port: number; onuId: number | null } | null {
  const pats: Array<[RegExp, (m: RegExpExecArray) => { slot: number; port: number; onuId: number | null }]> = [
    [/[eg]pon-onu_\d+\/(\d+)\/(\d+):(\d+)/i, (m) => ({ slot: +m[1], port: +m[2], onuId: +m[3] })],
    [/\b[eg]?pon\s*(\d+)\/(\d+):(\d+)/i, (m) => ({ slot: +m[1], port: +m[2], onuId: +m[3] })],
    [/\b\d+\/(\d+)\/(\d+):(\d+)/, (m) => ({ slot: +m[1], port: +m[2], onuId: +m[3] })],
    [/\b(\d+)\/(\d+):(\d+)/, (m) => ({ slot: +m[1], port: +m[2], onuId: +m[3] })],
    [/\b[eg]?pon\s*(\d+)\/(\d+)\b/i, (m) => ({ slot: +m[1], port: +m[2], onuId: null })],
    [/\b\d+\/(\d+)\/(\d+)\b/, (m) => ({ slot: +m[1], port: +m[2], onuId: null })],
    [/\b(\d+)\/(\d+)\b/, (m) => ({ slot: +m[1], port: +m[2], onuId: null })],
  ]
  // La posición se busca en el texto sin el identificador (una MAC con "-" o una IP no deben confundirla).
  for (const [re, f] of pats) {
    const m = re.exec(line)
    if (m) return f(m)
  }
  return null
}

export function statusFromText(text: string): ONUStatus {
  const t = text.toLowerCase()
  if (/dying|power[\s_-]?(off|fail|down)|\bpwr\b/.test(t)) return 'POWER_OFF'
  if (/\blos\b|\blof\b|link[\s_-]?loss|fiber/.test(t)) return 'LOS'
  if (/\b(online|working|active|up|registered|auth(enticated)?|ok)\b/.test(t) && !/\b(offline|inactive|deregist)/.test(t)) return 'ACTIVE'
  if (/\b(offline|down|inactive|deregist\w*|disconnect\w*)\b/.test(t)) return 'OFFLINE'
  return 'UNKNOWN'
}

/** Señal recibida: "-20.15(dBm)", "-20.15 dBm", "Rx: -20.15". */
export function rxFromText(text: string): number | null {
  const m = /(-\d{1,2}(?:\.\d+)?)\s*\(?\s*dbm/i.exec(text) ?? /\brx[^-\d]{0,12}(-\d{1,2}(?:\.\d+)?)/i.exec(text)
  if (!m) return null
  const n = Number(m[1])
  return n < 0 && n > -50 ? n : null
}

/** ONUs autorizadas de la salida de consola (una por línea). */
export function parseConsoleOnus(output: string): OnuReading[] {
  const byId = new Map<string, OnuReading>()
  for (const line of output.split(/\r?\n/)) {
    const id = findId(line)
    if (!id) continue
    const rest = line.replace(id.raw, ' ')
    const pos = findPosition(rest)
    if (!pos) continue
    const reading: OnuReading = {
      slot: pos.slot,
      port: pos.port,
      onuId: pos.onuId ?? 0,
      serial: id.id,
      name: null,
      status: statusFromText(rest),
      rxPower: rxFromText(rest),
      txPower: null,
    }
    // Si la misma ONU sale en dos comandos (estado y señal), se combinan.
    const prev = byId.get(id.id)
    byId.set(
      id.id,
      prev
        ? {
            ...prev,
            onuId: pos.onuId ?? prev.onuId,
            status: reading.status !== 'UNKNOWN' ? reading.status : prev.status,
            rxPower: reading.rxPower ?? prev.rxPower,
          }
        : reading
    )
  }
  // Señal por ONU en bloques: "show onu optical-ddm epon 0/1 5" … "RxPower : -19.59 dBm" (Hioso y similares).
  for (const m of output.matchAll(/optical-ddm\s+epon\s+(\d+)\/(\d+)\s+(\d+)\s*\r?\n([\s\S]*?)(?=\n[^\n]*[>#]\s|$)/gi)) {
    const rx = /rx\s*power\s*:\s*(-?\d{1,2}(?:\.\d+)?)/i.exec(m[4])
    if (!rx) continue
    const slot = Number(m[1])
    const port = Number(m[2])
    const onuId = Number(m[3])
    for (const [k, o] of byId) if (o.slot === slot && o.port === port && o.onuId === onuId) byId.set(k, { ...o, rxPower: Number(rx[1]) })
  }
  return [...byId.values()]
}

/** Líneas de plantilla «@onu …» que se ejecutan una vez por cada ONU en línea. */
export function perOnuCommands(template: string, onus: Array<Pick<OnuReading, 'slot' | 'port' | 'onuId' | 'status'>>, frame: number, max = 300) {
  const per = lines(template)
    .filter((l) => l.startsWith('@onu '))
    .map((l) => l.slice(5).trim())
  if (!per.length) return []
  const out: string[] = []
  for (const o of onus.filter((x) => x.status === 'ACTIVE').slice(0, max)) {
    for (const t of per) out.push(t.replace(/\{frame\}/g, String(frame)).replace(/\{slot\}/g, String(o.slot)).replace(/\{port\}/g, String(o.port)).replace(/\{onuId\}/g, String(o.onuId)))
  }
  return out
}

/** Puerto PON en el que está la sesión según el prompt: "EPON(epon_0/1)#", "(config-if-epon0/1)#", "interface epon 0/1". */
function promptPort(line: string) {
  const m = /\((?:config-if-)?[eg]?pon[_ ]?(\d+)\/(\d+)\)#/i.exec(line) ?? /\binterface\s+[eg]?pon\s*(\d+)\/(\d+)\s*$/i.exec(line)
  return m ? { slot: Number(m[1]), port: Number(m[2]) } : null
}

/** ONUs sin autorizar de la salida de consola (si la línea no trae el puerto, se usa el del prompt). */
export function parseConsoleAutofind(output: string): Discovery[] {
  const out = new Map<string, Discovery>()
  let ctx: { slot: number; port: number } | null = null
  for (const line of output.split(/\r?\n/)) {
    ctx = promptPort(line) ?? ctx
    const id = findId(line)
    if (!id) continue
    const pos = findPosition(line.replace(id.raw, ' ')) ?? ctx
    if (pos) out.set(id.id, { slot: pos.slot, port: pos.port, serial: id.id, equipment: null })
  }
  return [...out.values()]
}

// ── Plantillas por marca ────────────────────────────────────────────────────

/**
 * Comandos de lectura por defecto. Los de Hioso, C-Data y BDCOM son los habituales de esas marcas,
 * pero cambian según modelo y firmware: verifícalos con «Probar consola» y ajústalos en la OLT.
 */
export const CONSOLE_DEFAULTS: Partial<Record<OltBrand, { read: string; autofind: string }>> = {
  VSOL: {
    read: ['enable', 'terminal length 0', 'configure terminal', 'show onu info', 'exit'].join('\n'),
    autofind: ['enable', 'configure terminal', 'show onu auto-find', 'exit'].join('\n'),
  },
  // Verificado con una Hioso EPON real (prompt "EPON#", 4 puertos PON, paginación "Enter Key To Continue").
  HIOSO: {
    read: [
      'enable',
      'show onu info epon 0/1 all',
      'show onu info epon 0/2 all',
      'show onu info epon 0/3 all',
      'show onu info epon 0/4 all',
      '@onu show onu optical-ddm epon {frame}/{port} {onuId}',
    ].join('\n'),
    autofind: [
      'enable',
      'configure terminal',
      'interface epon 0/1',
      'show attempt onu',
      'exit',
      'interface epon 0/2',
      'show attempt onu',
      'exit',
      'interface epon 0/3',
      'show attempt onu',
      'exit',
      'interface epon 0/4',
      'show attempt onu',
      'exit',
      'exit',
    ].join('\n'),
  },
  CDATA: {
    read: ['enable', 'config', 'show ont info all'].join('\n'),
    autofind: ['enable', 'config', 'show ont autofind all'].join('\n'),
  },
  BDCOM: {
    read: ['enable', 'terminal length 0', 'show epon onu-information'].join('\n'),
    autofind: ['enable', 'terminal length 0', 'show epon inactive-onu'].join('\n'),
  },
}

const lines = (t: string) =>
  t
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

/** Lee una OLT por consola con sus plantillas (o las de su marca). */
export async function readByConsole(cli: CliTarget, brand: OltBrand, readTemplate: string | null, autofindTemplate: string | null, frame = 0) {
  const defaults = CONSOLE_DEFAULTS[brand]
  const read = readTemplate?.trim() || defaults?.read
  if (!read) throw new Error('Configura los comandos de lectura de esta OLT (Configuración › Comandos de lectura).')
  // Las líneas «@onu …» se ejecutan después, una vez por cada ONU en línea (p. ej. la señal óptica).
  const base = lines(read).filter((l) => !l.startsWith('@onu '))
  const r = await runCli(cli, base, { stopOnError: false })
  let onus = parseConsoleOnus(r.all)
  const extra = perOnuCommands(read, onus, frame)
  if (extra.length) {
    const head = base.filter((l) => /^(enable|en)$/i.test(l))
    const e = await runCli(cli, [...head, ...extra], { stopOnError: false })
    onus = parseConsoleOnus(`${r.all}\n${e.all}`)
  }
  const auto = autofindTemplate?.trim() || defaults?.autofind
  let discovered: Discovery[] = []
  if (auto) {
    const a = await runCli(cli, lines(auto), { stopOnError: false })
    const known = new Set(onus.map((o) => o.serial))
    discovered = parseConsoleAutofind(a.all).filter((d) => !known.has(d.serial))
  }
  return { onus, discovered }
}

// ── Consola de prueba (solo lectura) ────────────────────────────────────────

/**
 * Comandos permitidos en «Probar consola»: solo consultas y navegación entre modos.
 * Nada que cambie la configuración de la OLT.
 */
const READ_ONLY = [
  /^(show|display|dis|sh)\b/i,
  /^(enable|en|exit|end|quit|q)$/i,
  /^(configure terminal|config|conf t|configure)$/i,
  /^interface\s+\S+(\s+\S+)?$/i,
  /^(terminal length|terminal page-break|screen-length|scroll)\b.*$/i,
  /^ping\s+\S+$/i,
]
const QUERY = /^(show|display|dis|sh)\b/i

export function isReadOnlyCommand(cmd: string) {
  const c = cmd.trim()
  if (c.length === 0 || c.length > 200) return false
  if (c === '?') return true
  // Ayuda con «?»: en muchas OLT (p. ej. Hioso) la línea queda escrita y el Enter la EJECUTA.
  // Por eso solo se permite sobre comandos de consulta: «show onu ?» sí, «whitelist add … ?» no.
  if (c.endsWith('?')) return QUERY.test(c.replace(/\s*\?$/, '').trim())
  return READ_ONLY.some((re) => re.test(c))
}

/** Ejecuta comandos de lectura y devuelve la salida completa (para ajustar las plantillas). */
export async function testConsole(cli: CliTarget, commandsText: string) {
  const cmds = lines(commandsText)
  if (cmds.length === 0) throw new Error('Escribe al menos un comando.')
  if (cmds.length > 15) throw new Error('Máximo 15 comandos por prueba.')
  const bad = cmds.filter((c) => !isReadOnlyCommand(c))
  if (bad.length) throw new Error(`Solo se permiten comandos de consulta (show, display, enable, configure terminal, interface…). No permitido: ${bad.join(' · ')}`)
  const r = await runCli({ ...cli, timeoutMs: 20000 }, cmds, { stopOnError: false })
  const all = r.all.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
  return {
    output: all.length > 60000 ? `${all.slice(0, 60000)}\n… (salida recortada)` : all,
    onus: parseConsoleOnus(all),
    // Sin autorizar = las que aparecen con posición pero no en la lista de autorizadas.
    discovered: parseConsoleAutofind(all).filter((d) => !parseConsoleOnus(all).some((o) => o.serial === d.serial)),
  }
}
