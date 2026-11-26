import type { OLT, ONUStatus, PonEventKind } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'
import { audit } from '@/lib/audit'
import { AUTH_TEMPLATES, authCommands, freeOnuId, readOlt, type DriverConfig, type OltReading } from './drivers'
import { runCli } from './cli'
import { ONU_STATUS_LABEL } from './labels'

export { ONU_STATUS_LABEL, EVENT_LABEL } from './labels'

export async function getOltSettings(tenantId: string) {
  return (
    (await prisma.oltSettings.findUnique({ where: { tenantId } })) ?? {
      tenantId,
      lowSignal: -27,
      criticalSignal: -29,
      variationDb: 3,
      pollMinutes: 5,
      autoAuthorize: true,
      updatedAt: new Date(0),
    }
  )
}

export function driverConfig(olt: OLT): DriverConfig {
  const community = olt.communityEnc ? decrypt(olt.communityEnc) : ''
  return {
    brand: olt.brand,
    frame: olt.frame,
    snmp: community ? { host: olt.host, port: olt.port, community } : null,
    cli:
      olt.cliUsername && olt.cliPasswordEnc
        ? {
            protocol: olt.cliProtocol,
            host: olt.host,
            port: olt.cliPort,
            username: olt.cliUsername,
            password: decrypt(olt.cliPasswordEnc),
            enablePassword: olt.enablePasswordEnc ? decrypt(olt.enablePasswordEnc) : null,
          }
        : null,
  }
}

const STATUS_EVENT: Partial<Record<ONUStatus, PonEventKind>> = { POWER_OFF: 'POWER_OFF', LOS: 'LOS', OFFLINE: 'OFFLINE' }

async function openEvent(tenantId: string, oltId: string, onuId: string | null, kind: PonEventKind, message: string) {
  const open = await prisma.ponEvent.findFirst({ where: { oltId, onuId, kind, resolvedAt: null } })
  if (!open) await prisma.ponEvent.create({ data: { tenantId, oltId, onuId, kind, message } })
}
async function closeEvents(oltId: string, onuId: string | null, kinds: PonEventKind[], extra: { message?: string } = {}) {
  await prisma.ponEvent.updateMany({ where: { oltId, onuId, kind: { in: kinds }, resolvedAt: null, ...(extra.message ? { message: extra.message } : {}) }, data: { resolvedAt: new Date() } })
}

/** Aplica una lectura de la OLT: ONUs, eventos, autofind y autorización automática. */
export async function applyReading(olt: OLT, reading: OltReading) {
  const settings = await getOltSettings(olt.tenantId)
  const now = new Date()
  const existing = await prisma.oNU.findMany({ where: { oltId: olt.id } })
  const bySerial = new Map(existing.map((o) => [o.serial.toUpperCase(), o]))
  const seen = new Set<string>()

  for (const r of reading.onus) {
    const serial = r.serial.toUpperCase()
    seen.add(serial)
    const prev = bySerial.get(serial)
    const label = `${serial} (${olt.frame}/${r.slot}/${r.port}:${r.onuId})`
    if (!prev) {
      const created = await prisma.oNU.create({
        data: {
          oltId: olt.id, serial, name: r.name, slot: r.slot, port: r.port, onuIndex: r.onuId, status: r.status, rxPower: r.rxPower, txPower: r.txPower,
          inOlt: true, lastSeenAt: now, statusChangedAt: now, authState: 'AUTHORIZED',
        },
      })
      // Si ya llega caída en la primera lectura, también abre su evento.
      const kind = STATUS_EVENT[r.status]
      if (kind) await openEvent(olt.tenantId, olt.id, created.id, kind, `${label}: ${ONU_STATUS_LABEL[r.status]}`)
      continue
    }
    const changed = prev.status !== r.status
    await prisma.oNU.update({
      where: { id: prev.id },
      data: {
        slot: r.slot, port: r.port, onuIndex: r.onuId, status: prev.status === 'INACTIVE' && r.status !== 'ACTIVE' ? 'INACTIVE' : r.status,
        rxPower: r.rxPower, prevRxPower: prev.rxPower, txPower: r.txPower, inOlt: true, lastSeenAt: now,
        ...(changed ? { statusChangedAt: now } : {}),
        ...(prev.name ? {} : { name: r.name }),
        ...(prev.authState !== 'AUTHORIZED' ? { authState: 'AUTHORIZED', authorizedAt: prev.authorizedAt ?? now, authError: null } : {}),
      },
    })
    // Eventos por estado.
    if (changed) {
      const kind = STATUS_EVENT[r.status]
      if (r.status === 'ACTIVE') await closeEvents(olt.id, prev.id, ['POWER_OFF', 'LOS', 'OFFLINE'])
      else if (kind) {
        await closeEvents(olt.id, prev.id, (['POWER_OFF', 'LOS', 'OFFLINE'] as PonEventKind[]).filter((k) => k !== kind))
        await openEvent(olt.tenantId, olt.id, prev.id, kind, `${label}: ${ONU_STATUS_LABEL[r.status]}`)
      }
    }
    // Variación de señal entre lecturas.
    if (prev.rxPower != null && r.rxPower != null) {
      const diff = Math.round((r.rxPower - prev.rxPower) * 100) / 100
      if (Math.abs(diff) >= settings.variationDb) {
        await openEvent(olt.tenantId, olt.id, prev.id, 'SIGNAL_VARIATION', `${label}: señal ${prev.rxPower} → ${r.rxPower} dBm (${diff > 0 ? '+' : ''}${diff} dB)`)
      } else {
        await closeEvents(olt.id, prev.id, ['SIGNAL_VARIATION'])
      }
    }
  }
  // ONUs que ya no aparecen en la OLT.
  const gone = existing.filter((o) => o.inOlt && !seen.has(o.serial.toUpperCase()))
  if (gone.length) await prisma.oNU.updateMany({ where: { id: { in: gone.map((g) => g.id) } }, data: { inOlt: false } })

  // PON completa caída: un puerto con 2+ ONUs y ninguna en línea.
  const ports = new Map<string, OltReading['onus']>()
  for (const r of reading.onus) ports.set(`${r.slot}/${r.port}`, [...(ports.get(`${r.slot}/${r.port}`) ?? []), r])
  for (const [port, list] of ports) {
    const msg = `PON ${olt.frame}/${port}: ${list.length} ONUs fuera de línea`
    const prefix = `PON ${olt.frame}/${port}:`
    if (list.length >= 2 && list.every((o) => o.status !== 'ACTIVE')) await openEvent(olt.tenantId, olt.id, null, 'PON_DOWN', msg)
    else {
      const open = await prisma.ponEvent.findMany({ where: { oltId: olt.id, kind: 'PON_DOWN', resolvedAt: null, message: { startsWith: prefix } } })
      if (open.length) await prisma.ponEvent.updateMany({ where: { id: { in: open.map((e) => e.id) } }, data: { resolvedAt: now } })
    }
  }

  // Autofind.
  const found = new Set<string>()
  for (const d of reading.discovered) {
    const serial = d.serial.toUpperCase()
    if (seen.has(serial)) continue
    found.add(serial)
    await prisma.onuDiscovery.upsert({
      where: { oltId_serial: { oltId: olt.id, serial } },
      update: { slot: d.slot, port: d.port, equipment: d.equipment, lastSeenAt: now, active: true },
      create: { oltId: olt.id, serial, slot: d.slot, port: d.port, equipment: d.equipment },
    })
  }
  await prisma.onuDiscovery.updateMany({ where: { oltId: olt.id, active: true, serial: { notIn: [...found] } }, data: { active: false } })

  // Pre-autorizadas que la OLT ya detectó → autorizar.
  let autoAuthorized = 0
  if (settings.autoAuthorize && found.size) {
    const pre = await prisma.oNU.findMany({
      where: { olt: { tenantId: olt.tenantId }, authState: 'PREAUTHORIZED', serial: { in: [...found] } },
    })
    for (const p of pre) {
      const d = reading.discovered.find((x) => x.serial.toUpperCase() === p.serial.toUpperCase())!
      await prisma.oNU.update({ where: { id: p.id }, data: { oltId: olt.id, slot: d.slot, port: d.port } })
      const r = await authorizeOnu(p.id).catch(() => null)
      if (r?.ok) autoAuthorized++
    }
  }

  await prisma.oLT.update({
    where: { id: olt.id },
    data: { status: 'ONLINE', lastPollAt: now, lastError: null, temperature: reading.temperature, uptimeSec: reading.uptimeSec },
  })
  return { onus: reading.onus.length, discovered: found.size, autoAuthorized }
}

/** Lee una OLT ahora. Si falla, la marca fuera de línea con el motivo. */
export async function pollOlt(oltId: string) {
  const olt = await prisma.oLT.findUniqueOrThrow({ where: { id: oltId } })
  try {
    const reading = await readOlt(driverConfig(olt))
    return { ok: true as const, ...(await applyReading(olt, reading)) }
  } catch (e) {
    const message = (e instanceof Error ? e.message : String(e)).slice(0, 500)
    await prisma.oLT.update({ where: { id: olt.id }, data: { status: 'OFFLINE', lastPollAt: new Date(), lastError: message } })
    return { ok: false as const, error: message }
  }
}

/** Lee las OLT que toca según la frecuencia de cada empresa (lo llama el programador cada minuto). */
export async function pollDueOlts() {
  const olts = await prisma.oLT.findMany({ where: { pollEnabled: true, tenant: { isActive: true } }, select: { id: true, tenantId: true, lastPollAt: true } })
  const settings = new Map<string, number>()
  for (const o of olts) {
    if (!settings.has(o.tenantId)) settings.set(o.tenantId, (await getOltSettings(o.tenantId)).pollMinutes)
    const due = !o.lastPollAt || Date.now() - o.lastPollAt.getTime() >= settings.get(o.tenantId)! * 60_000 - 5_000
    if (due) await pollOlt(o.id)
  }
}

/**
 * Autoriza una ONU en la OLT con la plantilla de comandos de su marca (o la propia de la OLT).
 * Necesita el slot/puerto donde la OLT la detectó y el acceso por consola.
 */
export async function authorizeOnu(onuId: string, userId?: string) {
  const onu = await prisma.oNU.findUniqueOrThrow({
    where: { id: onuId },
    include: { olt: true, onuModel: true, speedPlan: true, customer: { select: { firstName: true, lastName: true, code: true } } },
  })
  const olt = onu.olt
  const fail = async (message: string) => {
    await prisma.oNU.update({ where: { id: onu.id }, data: { authState: 'FAILED', authError: message.slice(0, 500) } })
    await audit({ tenantId: olt.tenantId, userId, action: 'onu.authorize_failed', entity: 'OLT', entityId: olt.id, details: { serial: onu.serial, error: message } })
    return { ok: false as const, error: message }
  }
  const cfg = driverConfig(olt)
  if (!cfg.cli) return fail('La OLT no tiene acceso por consola (usuario y clave de Telnet/SSH).')

  const used = (await prisma.oNU.findMany({ where: { oltId: olt.id, slot: onu.slot, port: onu.port, inOlt: true, id: { not: onu.id } }, select: { onuIndex: true } }))
    .map((o) => o.onuIndex)
    .filter((n): n is number => n != null)
  let commands: string[]
  let newId: number
  try {
    newId = freeOnuId(used, olt.brand)
    const desc = onu.customer ? `${onu.customer.firstName}_${onu.customer.lastName}` : onu.name ?? onu.serial
    commands = authCommands(olt.authTemplate?.trim() || AUTH_TEMPLATES[olt.brand], {
      frame: olt.frame,
      slot: onu.slot,
      port: onu.port,
      onuId: newId,
      serial: onu.serial,
      desc,
      lineProfile: onu.speedPlan?.lineProfile ?? olt.lineProfile ?? '',
      srvProfile: onu.speedPlan?.srvProfile ?? olt.srvProfile ?? '',
      vlan: onu.vlan ?? onu.speedPlan?.vlan ?? olt.defaultVlan ?? '',
      type: onu.onuModel?.oltType ?? '',
    })
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e))
  }
  try {
    await runCli(cfg.cli, commands)
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e))
  }
  await prisma.oNU.update({
    where: { id: onu.id },
    data: { authState: 'AUTHORIZED', authorizedAt: new Date(), authError: null, onuIndex: newId, inOlt: true, status: 'UNKNOWN', statusChangedAt: new Date() },
  })
  await prisma.onuDiscovery.updateMany({ where: { oltId: olt.id, serial: onu.serial }, data: { active: false } })
  await audit({ tenantId: olt.tenantId, userId, action: 'onu.authorize', entity: 'OLT', entityId: olt.id, details: { serial: onu.serial, slot: onu.slot, port: onu.port, onuId: newId } })
  return { ok: true as const, onuId: newId }
}
