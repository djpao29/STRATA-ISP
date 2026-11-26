import type { OltBrand, ONUStatus } from '@prisma/client'
import { get, gponSerial, indexOf, num, text, walk, type SnmpTarget, type Varbind } from './snmp'
import { runCli, type CliTarget } from './cli'

/**
 * Lectura de OLTs por marca. Huawei y ZTE se leen por SNMP (MIBs del fabricante); VSOL por consola.
 * Todo es de solo lectura; autorizar se hace con la plantilla de comandos (ver authCommands).
 */

export type OnuReading = {
  slot: number
  port: number
  onuId: number
  serial: string
  name: string | null
  status: ONUStatus
  rxPower: number | null
  txPower: number | null
}
export type Discovery = { slot: number; port: number; serial: string; equipment: string | null }
export type OltReading = { uptimeSec: number | null; temperature: number | null; onus: OnuReading[]; discovered: Discovery[] }

export type DriverConfig = { brand: OltBrand; frame: number; snmp: SnmpTarget | null; cli: CliTarget | null }

const SYS_UPTIME = '1.3.6.1.2.1.1.3.0'

const keyOf = (a: number[]) => a.join('.')
function byIndex(rows: Varbind[], base: string, take = 2) {
  const m = new Map<string, Varbind['value']>()
  for (const r of rows) m.set(keyOf(indexOf(r.oid, base).slice(0, take)), r.value)
  return m
}
const round2 = (n: number) => Math.round(n * 100) / 100

// ── Huawei (HUAWEI-XPON-MIB) ───────────────────────────────────────────────

const HW = '1.3.6.1.4.1.2011.6.128.1.1.2'
export const HUAWEI_OID = {
  serial: `${HW}.43.1.3`,
  desc: `${HW}.43.1.9`,
  runStatus: `${HW}.46.1.15`,
  lastDownCause: `${HW}.46.1.24`,
  rxPower: `${HW}.51.1.4`,
  txPower: `${HW}.51.1.3`,
  autofindSn: `${HW}.48.1.2`,
  boardTemp: '1.3.6.1.4.1.2011.2.6.7.1.1.2.1.10',
}

/** ifIndex GPON de Huawei: 4194304000 + slot·8192 + puerto·256. */
export function huaweiPort(ifIndex: number) {
  const r = ifIndex - 4194304000
  return { slot: Math.floor(r / 8192), port: Math.floor((r % 8192) / 256) }
}

/** Estado según "run status" (1 en línea, 2 fuera) y la última causa de caída (1 LOS, 13 dying-gasp). */
export function huaweiStatus(run: number | null, cause: number | null): ONUStatus {
  if (run === 1) return 'ACTIVE'
  if (run === 2) {
    if (cause === 13) return 'POWER_OFF'
    if (cause === 1 || cause === 2 || cause === 3) return 'LOS'
    return 'OFFLINE'
  }
  return 'UNKNOWN'
}

/** Potencia en centésimas de dBm; 2147483647 (o fuera de rango) = sin lectura. */
export function huaweiPower(v: number | null) {
  if (v == null || v === 2147483647 || v <= -5000 || v >= 1000) return null
  return round2(v / 100)
}

async function readHuawei(c: DriverConfig): Promise<OltReading> {
  const t = c.snmp!
  const [serials, descs, runs, causes, rx, tx, autofind, temps, up] = await Promise.all([
    walk(t, HUAWEI_OID.serial),
    walk(t, HUAWEI_OID.desc),
    walk(t, HUAWEI_OID.runStatus),
    walk(t, HUAWEI_OID.lastDownCause).catch(() => []),
    walk(t, HUAWEI_OID.rxPower).catch(() => []),
    walk(t, HUAWEI_OID.txPower).catch(() => []),
    walk(t, HUAWEI_OID.autofindSn).catch(() => []),
    walk(t, HUAWEI_OID.boardTemp).catch(() => []),
    get(t, [SYS_UPTIME]).catch(() => [null]),
  ])
  const d = byIndex(descs, HUAWEI_OID.desc)
  const r = byIndex(runs, HUAWEI_OID.runStatus)
  const ca = byIndex(causes, HUAWEI_OID.lastDownCause)
  const rxm = byIndex(rx, HUAWEI_OID.rxPower)
  const txm = byIndex(tx, HUAWEI_OID.txPower)
  const onus: OnuReading[] = []
  for (const row of serials) {
    const [ifIndex, onuId] = indexOf(row.oid, HUAWEI_OID.serial)
    const serial = gponSerial(row.value)
    if (!serial || ifIndex == null || onuId == null) continue
    const k = keyOf([ifIndex, onuId])
    onus.push({
      ...huaweiPort(ifIndex),
      onuId,
      serial,
      name: text(d.get(k) ?? null),
      status: huaweiStatus(num(r.get(k) ?? null), num(ca.get(k) ?? null)),
      rxPower: huaweiPower(num(rxm.get(k) ?? null)),
      txPower: huaweiPower(num(txm.get(k) ?? null)),
    })
  }
  const discovered = autofind
    .map((row): Discovery | null => {
      const [ifIndex] = indexOf(row.oid, HUAWEI_OID.autofindSn)
      const serial = gponSerial(row.value)
      return serial ? { ...huaweiPort(ifIndex), serial, equipment: null } : null
    })
    .filter((x): x is Discovery => !!x)
  const temperature = temps.map((x) => num(x.value)).filter((n): n is number => n != null && n > 0 && n < 120)
  return { uptimeSec: uptime(up[0]), temperature: temperature.length ? Math.max(...temperature) : null, onus, discovered }
}

// ── ZTE C300/C320/C600 (ZXGPON) ─────────────────────────────────────────────

const ZT = '1.3.6.1.4.1.3902.1012.3'
export const ZTE_OID = {
  name: `${ZT}.28.1.1.2`,
  serial: `${ZT}.28.1.1.5`,
  phase: `${ZT}.28.2.1.4`,
  rxPower: `${ZT}.50.12.1.1.10`,
}

/** ifIndex GPON de ZTE: 268435456 + slot·65536 + puerto·256 (gpon-olt_1/slot/puerto). */
export function ztePort(ifIndex: number) {
  const r = ifIndex - 268435456
  return { slot: Math.floor(r / 65536), port: Math.floor((r % 65536) / 256) }
}

/** Fase de la ONU: 1 logging, 2 LOS, 3 syncMib, 4 working, 5 dyingGasp, 6 authFailed, 7 offline. */
export function zteStatus(phase: number | null): ONUStatus {
  switch (phase) {
    case 4:
      return 'ACTIVE'
    case 2:
      return 'LOS'
    case 5:
      return 'POWER_OFF'
    case 1:
    case 3:
    case 6:
    case 7:
      return 'OFFLINE'
    default:
      return 'UNKNOWN'
  }
}

/** Potencia recibida por la ONU: valor·0.002 − 30 dBm (65535 = sin lectura). */
export function ztePower(v: number | null) {
  if (v == null || v === 65535 || v < 0) return null
  return round2(v * 0.002 - 30)
}

/** Autofind de ZTE por consola: líneas "gpon-onu_1/2/3:1  ZTEGC0A1B2C3  unknown". */
export function parseZteUncfg(output: string): Discovery[] {
  const out: Discovery[] = []
  for (const m of output.matchAll(/gpon-onu_\d+\/(\d+)\/(\d+):\d+\s+([A-Z0-9]{4}[0-9A-F]{8})/gi)) {
    out.push({ slot: Number(m[1]), port: Number(m[2]), serial: m[3].toUpperCase(), equipment: null })
  }
  return out
}

async function readZte(c: DriverConfig): Promise<OltReading> {
  const t = c.snmp!
  const [names, serials, phases, rx, up] = await Promise.all([
    walk(t, ZTE_OID.name),
    walk(t, ZTE_OID.serial),
    walk(t, ZTE_OID.phase),
    walk(t, ZTE_OID.rxPower).catch(() => []),
    get(t, [SYS_UPTIME]).catch(() => [null]),
  ])
  const n = byIndex(names, ZTE_OID.name)
  const p = byIndex(phases, ZTE_OID.phase)
  const rxm = byIndex(rx, ZTE_OID.rxPower)
  const onus: OnuReading[] = []
  for (const row of serials) {
    const [ifIndex, onuId] = indexOf(row.oid, ZTE_OID.serial)
    const serial = gponSerial(row.value)
    if (!serial || ifIndex == null || onuId == null) continue
    const k = keyOf([ifIndex, onuId])
    onus.push({
      ...ztePort(ifIndex),
      onuId,
      serial,
      name: text(n.get(k) ?? null),
      status: zteStatus(num(p.get(k) ?? null)),
      rxPower: ztePower(num(rxm.get(k) ?? null)),
      txPower: null,
    })
  }
  // Las ONUs sin configurar se leen por consola (si hay acceso configurado).
  let discovered: Discovery[] = []
  if (c.cli) {
    const r = await runCli(c.cli, ['terminal length 0', 'show gpon onu uncfg'], { stopOnError: false })
    discovered = parseZteUncfg(r.all)
  }
  return { uptimeSec: uptime(up[0]), temperature: null, onus, discovered }
}

// ── VSOL (consola) ──────────────────────────────────────────────────────────

/**
 * Lista de ONUs de VSOL ("show onu info"): líneas con "GPON0/<puerto>:<id>", el SN y el estado
 * (online/offline/los/dying-gasp/power-off).
 */
export function parseVsolOnus(output: string): OnuReading[] {
  const out: OnuReading[] = []
  for (const line of output.split(/\r?\n/)) {
    const m = /GPON\s*(\d+)\/(\d+):(\d+)\b.*?\b([A-Z0-9]{4}[0-9A-F]{8})\b(.*)$/i.exec(line)
    if (!m) continue
    const rest = m[5].toLowerCase()
    const status: ONUStatus = /dying|power/.test(rest)
      ? 'POWER_OFF'
      : /\blos\b|lof/.test(rest)
        ? 'LOS'
        : /online|working|active/.test(rest)
          ? 'ACTIVE'
          : /offline|down/.test(rest)
            ? 'OFFLINE'
            : 'UNKNOWN'
    const rx = /(-\d{1,2}\.\d+)\s*\(?dbm/i.exec(rest)
    out.push({ slot: Number(m[1]), port: Number(m[2]), onuId: Number(m[3]), serial: m[4].toUpperCase(), name: null, status, rxPower: rx ? Number(rx[1]) : null, txPower: null })
  }
  return out
}

/** Autofind de VSOL ("show onu auto-find"): "GPON0/1  ...  VSOL1A2B3C4D". */
export function parseVsolAutofind(output: string): Discovery[] {
  const out: Discovery[] = []
  for (const line of output.split(/\r?\n/)) {
    const m = /GPON\s*(\d+)\/(\d+)\b.*?\b([A-Z0-9]{4}[0-9A-F]{8})\b/i.exec(line)
    if (m) out.push({ slot: Number(m[1]), port: Number(m[2]), serial: m[3].toUpperCase(), equipment: null })
  }
  return out
}

async function readVsol(c: DriverConfig): Promise<OltReading> {
  if (!c.cli) throw new Error('Las OLT VSOL se leen por consola: configura usuario y clave de Telnet/SSH.')
  const r = await runCli(c.cli, ['enable', 'terminal length 0', 'configure terminal', 'show onu info', 'show onu auto-find', 'exit'], { stopOnError: false })
  const up = c.snmp ? await get(c.snmp, [SYS_UPTIME]).catch(() => [null]) : [null]
  return { uptimeSec: uptime(up[0]), temperature: null, onus: parseVsolOnus(r.all), discovered: parseVsolAutofind(r.all).filter((d) => !parseVsolOnus(r.all).some((o) => o.serial === d.serial)) }
}

function uptime(v: Varbind['value'] | undefined) {
  const n = num(v ?? null)
  return n == null ? null : Math.floor(n / 100) // timeticks (centésimas)
}

export async function readOlt(c: DriverConfig): Promise<OltReading> {
  if (c.brand === 'VSOL') return readVsol(c)
  if (!c.snmp) throw new Error('Falta la comunidad SNMP de la OLT.')
  return c.brand === 'ZTE' ? readZte(c) : readHuawei(c)
}

// ── Autorización ────────────────────────────────────────────────────────────

/** Plantillas por defecto. Variables: {frame} {slot} {port} {onuId} {serial} {desc} {lineProfile} {srvProfile} {vlan} {type}. */
export const AUTH_TEMPLATES: Record<OltBrand, string> = {
  HUAWEI: [
    'enable',
    'config',
    'interface gpon {frame}/{slot}',
    'ont add {port} {onuId} sn-auth {serial} omci ont-lineprofile-id {lineProfile} ont-srvprofile-id {srvProfile} desc "{desc}"',
    'quit',
    'service-port vlan {vlan} gpon {frame}/{slot}/{port} ont {onuId} gemport 1 multi-service user-vlan {vlan} tag-transform translate',
    'quit',
    'save',
  ].join('\n'),
  ZTE: [
    'configure terminal',
    'interface gpon-olt_{frame}/{slot}/{port}',
    'onu {onuId} type {type} sn {serial}',
    'exit',
    'interface gpon-onu_{frame}/{slot}/{port}:{onuId}',
    'name {desc}',
    'tcont 1 profile {lineProfile}',
    'gemport 1 tcont 1',
    'service-port 1 vport 1 user-vlan {vlan} vlan {vlan}',
    'exit',
    'pon-onu-mng gpon-onu_{frame}/{slot}/{port}:{onuId}',
    'service internet gemport 1 vlan {vlan}',
    'exit',
    'end',
    'write',
  ].join('\n'),
  VSOL: [
    'enable',
    'configure terminal',
    'interface gpon {frame}/{slot}',
    'onu add {port} {onuId} profile {lineProfile} sn {serial}',
    'onu {port} {onuId} desc {desc}',
    'exit',
    'exit',
    'write',
  ].join('\n'),
}

export type AuthVars = { frame: number; slot: number; port: number; onuId: number; serial: string; desc: string; lineProfile: string; srvProfile: string; vlan: number | string; type: string }

/** Arma los comandos de una plantilla; falla si queda una variable sin valor. */
export function authCommands(template: string, v: AuthVars) {
  const desc = v.desc.replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 32) || 'onu'
  const vars: Record<string, string> = {
    frame: String(v.frame),
    slot: String(v.slot),
    port: String(v.port),
    onuId: String(v.onuId),
    serial: v.serial.toUpperCase(),
    desc,
    lineProfile: v.lineProfile,
    srvProfile: v.srvProfile,
    vlan: String(v.vlan),
    type: v.type,
  }
  const lines = template
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) =>
      l.replace(/\{(\w+)\}/g, (_, k: string) => {
        if (!(k in vars)) throw new Error(`Variable desconocida en la plantilla: {${k}}`)
        if (vars[k] === '') throw new Error(`Falta el valor de {${k}} (configúralo en la OLT o en el plan de velocidad).`)
        return vars[k]
      })
    )
  return lines
}

/** Primer ID de ONU libre en un puerto PON (Huawei empieza en 0; ZTE y VSOL en 1). */
export function freeOnuId(used: number[], brand: OltBrand, max = 128) {
  const set = new Set(used)
  for (let i = brand === 'HUAWEI' ? 0 : 1; i < max; i++) if (!set.has(i)) return i
  throw new Error('El puerto PON no tiene IDs de ONU libres.')
}
