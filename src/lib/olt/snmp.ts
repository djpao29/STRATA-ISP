import snmp from 'net-snmp'

/** Lectura SNMP v2c de una OLT (solo lectura: nunca se hace SET). */
export type SnmpTarget = { host: string; port: number; community: string; timeoutMs?: number }
export type Varbind = { oid: string; value: Buffer | number | string | null }

export class SnmpError extends Error {}

function session(t: SnmpTarget) {
  return snmp.createSession(t.host, t.community, {
    port: t.port,
    version: snmp.Version2c,
    timeout: t.timeoutMs ?? 4000,
    retries: 1,
  })
}

function describe(err: unknown, t: SnmpTarget) {
  const msg = err instanceof Error ? err.message : String(err)
  if (/timed? ?out/i.test(msg)) return new SnmpError(`La OLT ${t.host}:${t.port} no respondió por SNMP (revisa IP, puerto, comunidad y que SNMP esté habilitado).`)
  return new SnmpError(`SNMP ${t.host}: ${msg}`)
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
