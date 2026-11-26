import snmp from 'net-snmp'

/** Lectura SNMP (v2c con comunidad o v3 con usuario) de una OLT. Solo lectura: nunca se hace SET. */
export type SnmpV3 = {
  user: string
  level: 'noAuthNoPriv' | 'authNoPriv' | 'authPriv'
  authProtocol?: 'MD5' | 'SHA'
  authKey?: string
  privProtocol?: 'DES' | 'AES'
  privKey?: string
}
export type SnmpTarget = { host: string; port: number; community: string; v3?: SnmpV3 | null; timeoutMs?: number }
export type Varbind = { oid: string; value: Buffer | number | string | null }

export class SnmpError extends Error {}

function session(t: SnmpTarget) {
  const options = { port: t.port, timeout: t.timeoutMs ?? 4000, retries: 1 }
  if (t.v3) {
    const level = { noAuthNoPriv: snmp.SecurityLevel.noAuthNoPriv, authNoPriv: snmp.SecurityLevel.authNoPriv, authPriv: snmp.SecurityLevel.authPriv }[t.v3.level]
    return snmp.createV3Session(
      t.host,
      {
        name: t.v3.user,
        level,
        ...(t.v3.level !== 'noAuthNoPriv'
          ? { authProtocol: t.v3.authProtocol === 'SHA' ? snmp.AuthProtocols.sha : snmp.AuthProtocols.md5, authKey: t.v3.authKey ?? '' }
          : {}),
        ...(t.v3.level === 'authPriv' ? { privProtocol: t.v3.privProtocol === 'AES' ? snmp.PrivProtocols.aes : snmp.PrivProtocols.des, privKey: t.v3.privKey ?? '' } : {}),
      },
      { ...options, version: snmp.Version3 }
    )
  }
  return snmp.createSession(t.host, t.community, { ...options, version: snmp.Version2c })
}

function describe(err: unknown, t: SnmpTarget) {
  const msg = err instanceof Error ? err.message : String(err)
  if (/timed? ?out/i.test(msg))
    return new SnmpError(`La OLT ${t.host}:${t.port} no respondió por SNMP (revisa IP, puerto, ${t.v3 ? 'usuario y claves v3' : 'comunidad'} y que SNMP esté habilitado).`)
  if (/digital envelope|unsupported/i.test(msg))
    return new SnmpError('SNMP v3: este servidor no tiene habilitado el cifrado DES (OpenSSL 3). Arranca el sistema con «node --openssl-legacy-provider» (ya incluido en npm run dev/start y en Docker) o usa AES en la OLT.')
  if (/authentication|wrong digest|decryption|unknown user/i.test(msg)) return new SnmpError(`SNMP v3 ${t.host}: usuario o claves incorrectos (${msg}).`)
  return new SnmpError(`SNMP ${t.host}: ${msg}`)
}

const SYS = { descr: '1.3.6.1.2.1.1.1.0', uptime: '1.3.6.1.2.1.1.3.0', name: '1.3.6.1.2.1.1.5.0' }

/** Datos estándar del equipo (cualquier marca): descripción (modelo/firmware), nombre y tiempo encendida. */
export async function systemInfo(t: SnmpTarget) {
  const [descr, uptime, name] = await get(t, [SYS.descr, SYS.uptime, SYS.name])
  const ticks = num(uptime)
  return { descr: text(descr), name: text(name), uptimeSec: ticks == null ? null : Math.floor(ticks / 100) }
}

/** Recorre un subárbol completo (GETBULK). */
export function walk(t: SnmpTarget, oid: string, maxRows = 20000): Promise<Varbind[]> {
  return new Promise((resolve, reject) => {
    const s = session(t)
    const out: Varbind[] = []
    s.subtree(
      oid,
      20,
      (varbinds) => {
        for (const vb of varbinds) {
          if (snmp.isVarbindError(vb)) continue
          out.push({ oid: vb.oid, value: vb.value as Varbind['value'] })
        }
        if (out.length > maxRows) return true // corta el recorrido
      },
      (err) => {
        s.close()
        if (err) reject(describe(err, t))
        else resolve(out)
      }
    )
  })
}

/** GET de OIDs sueltos; los que no existen vuelven como null. */
export function get(t: SnmpTarget, oids: string[]): Promise<Array<Varbind['value']>> {
  return new Promise((resolve, reject) => {
    const s = session(t)
    s.get(oids, (err, varbinds) => {
      s.close()
      if (err) return reject(describe(err, t))
      resolve((varbinds ?? []).map((vb) => (snmp.isVarbindError(vb) ? null : (vb.value as Varbind['value']))))
    })
  })
}

/** Últimos N números del OID como índice (p. ej. ifIndex.ontId). */
export function indexOf(oid: string, base: string) {
  return oid.slice(base.length + 1).split('.').map(Number)
}

export function num(v: Varbind['value']): number | null {
  if (v == null) return null
  if (typeof v === 'number') return v
  if (Buffer.isBuffer(v)) {
    const n = Number(v.toString())
    return Number.isFinite(n) ? n : null
  }
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function text(v: Varbind['value']): string | null {
  if (v == null) return null
  return (Buffer.isBuffer(v) ? v.toString('utf8') : String(v)).replace(/\0/g, '').trim() || null
}

/**
 * Serial GPON: los 8 bytes del SN vienen como 4 letras de fabricante + 4 bytes. Se muestra como en la OLT:
 * "HWTC1A2B3C4D". Si ya viene como texto, se normaliza.
 */
export function gponSerial(v: Varbind['value']): string | null {
  if (v == null) return null
  if (Buffer.isBuffer(v) && v.length === 8) {
    const vendor = v.subarray(0, 4).toString('latin1')
    if (/^[A-Za-z0-9]{4}$/.test(vendor)) return (vendor + v.subarray(4).toString('hex')).toUpperCase()
    return v.toString('hex').toUpperCase()
  }
  const t = text(v)
  return t ? t.replace(/[^0-9A-Za-z]/g, '').toUpperCase() : null
}
