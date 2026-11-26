'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireActionUser } from '@/lib/session'
import { audit } from '@/lib/audit'
import { encrypt } from '@/lib/crypto'
import { HOST_REGEX } from '@/lib/net'
import { formToObject, toActionError, type ActionState } from '@/lib/actions'
import { authorizeOnu, driverConfig, pollOlt, snmpTarget } from '@/lib/olt/service'
import { SNMP_BRANDS } from '@/lib/olt/drivers'
import { normalizeOnuId, testConsole } from '@/lib/olt/console'
import { systemInfo } from '@/lib/olt/snmp'

const refresh = () => revalidatePath('/dashboard/olt', 'layout')
const coords = z.string().regex(/^-?\d{1,2}(\.\d+)?,\s*-?\d{1,3}(\.\d+)?$/, 'Formato: latitud,longitud').optional()
const optInt = (min: number, max: number) => z.coerce.number().int().min(min).max(max).optional()
/** Serial GPON (HWTC1A2B3C4D) o MAC EPON (aa:bb:cc:dd:ee:ff, aabb.ccdd.eeff…), normalizado. */
const serialRule = z
  .string({ required_error: 'Obligatorio' })
  .refine((v) => normalizeOnuId(v) !== null, 'Serial GPON (ej. HWTC1A2B3C4D) o MAC EPON (ej. 00:1E:A5:11:22:33)')
  .transform((v) => normalizeOnuId(v)!)

async function ownOlt(id: string, tenantId: string) {
  const olt = await prisma.oLT.findFirst({ where: { id, tenantId } })
  if (!olt) throw new Error('La OLT no existe.')
  return olt
}
async function ownOnu(id: string, tenantId: string) {
  const onu = await prisma.oNU.findFirst({ where: { id, olt: { tenantId } } })
  if (!onu) throw new Error('La ONU no existe.')
  return onu
}

/** Valida que las referencias opcionales (cliente, modelo, plan, NAP) sean de la empresa. */
async function checkRefs(tenantId: string, r: { customerId?: string; onuModelId?: string; speedPlanId?: string; napBoxId?: string }) {
  if (r.customerId && !(await prisma.customer.findFirst({ where: { id: r.customerId, tenantId } }))) throw new Error('El cliente no existe.')
  if (r.onuModelId && !(await prisma.onuModel.findFirst({ where: { id: r.onuModelId, tenantId } }))) throw new Error('El modelo de ONU no existe.')
  if (r.speedPlanId && !(await prisma.oltSpeedPlan.findFirst({ where: { id: r.speedPlanId, tenantId } }))) throw new Error('El plan de velocidad no existe.')
  if (r.napBoxId && !(await prisma.napBox.findFirst({ where: { id: r.napBoxId, tenantId } }))) throw new Error('La caja NAP no existe.')
}

// ── OLT ─────────────────────────────────────────────────────────────────────

const oltSchema = z.object({
  name: z.string({ required_error: 'Obligatorio' }).max(100),
  brand: z.enum(['HUAWEI', 'ZTE', 'VSOL', 'HIOSO', 'CDATA', 'BDCOM']),
  vendor: z.string().max(60).optional(),
  softwareVersion: z.string().max(60).optional(),
  ponType: z.enum(['GPON', 'EPON', 'GPON_EPON']).default('GPON'),
  snmpVersion: z.enum(['2c', '3']).default('2c'),
  snmpV3User: z.string().max(60).optional(),
  snmpV3Level: z.enum(['noAuthNoPriv', 'authNoPriv', 'authPriv']).default('authPriv'),
  snmpV3AuthProto: z.enum(['MD5', 'SHA']).default('MD5'),
  snmpV3AuthKey: z.string().min(8, 'Mínimo 8 caracteres (SNMP v3)').max(120).optional(),
  snmpV3PrivProto: z.enum(['DES', 'AES']).default('DES'),
  snmpV3PrivKey: z.string().min(8, 'Mínimo 8 caracteres (SNMP v3)').max(120).optional(),
  readTemplate: z.string().max(4000).optional(),
  autofindTemplate: z.string().max(4000).optional(),
  host: z.string({ required_error: 'Obligatorio' }).regex(HOST_REGEX, 'IP o nombre de host inválido'),
  port: z.coerce.number().int().min(1).max(65535).default(161),
  community: z.string().max(100).optional(),
  cliProtocol: z.enum(['TELNET', 'SSH']).default('TELNET'),
  cliPort: z.coerce.number().int().min(1).max(65535).default(23),
  cliUsername: z.string().max(60).optional(),
  cliPassword: z.string().max(120).optional(),
  enablePassword: z.string().max(120).optional(),
  frame: z.coerce.number().int().min(0).max(15).default(0),
  coordinates: coords,
  pollEnabled: z.literal('on').optional(),
  lineProfile: z.string().max(60).optional(),
  srvProfile: z.string().max(60).optional(),
  defaultVlan: optInt(1, 4094),
  authTemplate: z.string().max(4000).optional(),
})

export async function saveOlt(id: string | null, _: ActionState, formData: FormData): Promise<ActionState> {
  let target: string | null = null
  try {
    const user = await requireActionUser('olt')
    const { community, cliPassword, enablePassword, pollEnabled, snmpV3AuthKey, snmpV3PrivKey, ...d } = oltSchema.parse(formToObject(formData))
    if (d.snmpVersion === '3' && !d.snmpV3User) return { error: 'Revisa los campos marcados.', fieldErrors: { snmpV3User: ['Obligatorio con SNMP v3'] } }
    const data = {
      ...d,
      vendor: d.vendor ?? null,
      softwareVersion: d.softwareVersion ?? null,
      snmpV3User: d.snmpV3User ?? null,
      readTemplate: d.readTemplate ?? null,
      autofindTemplate: d.autofindTemplate ?? null,
      ...(snmpV3AuthKey ? { snmpV3AuthKeyEnc: encrypt(snmpV3AuthKey) } : {}),
      ...(snmpV3PrivKey ? { snmpV3PrivKeyEnc: encrypt(snmpV3PrivKey) } : {}),
      cliUsername: d.cliUsername ?? null,
      coordinates: d.coordinates ?? null,
      lineProfile: d.lineProfile ?? null,
      srvProfile: d.srvProfile ?? null,
      defaultVlan: d.defaultVlan ?? null,
      authTemplate: d.authTemplate ?? null,
      pollEnabled: pollEnabled === 'on',
      ...(community ? { communityEnc: encrypt(community) } : {}),
      ...(cliPassword ? { cliPasswordEnc: encrypt(cliPassword) } : {}),
      ...(enablePassword ? { enablePasswordEnc: encrypt(enablePassword) } : {}),
    }
    if (id) {
      await ownOlt(id, user.tenantId)
      await prisma.oLT.update({ where: { id }, data })
      await audit({ tenantId: user.tenantId, userId: user.id, action: 'olt.update', entity: 'OLT', entityId: id })
    } else {
      if (!community && d.snmpVersion === '2c' && SNMP_BRANDS.includes(d.brand))
        return { error: 'Revisa los campos marcados.', fieldErrors: { community: ['Obligatoria para Huawei y ZTE (lectura SNMP)'] } }
      if (!SNMP_BRANDS.includes(d.brand) && !(d.cliUsername && cliPassword))
        return { error: 'Revisa los campos marcados.', fieldErrors: { cliUsername: ['Esta marca se lee por consola: usuario y clave son obligatorios'] } }
      const olt = await prisma.oLT.create({ data: { ...data, communityEnc: data.communityEnc ?? encrypt(''), tenantId: user.tenantId } })
      await audit({ tenantId: user.tenantId, userId: user.id, action: 'olt.create', entity: 'OLT', entityId: olt.id })
      target = `/dashboard/olt/${olt.id}`
    }
    refresh()
  } catch (error) {
    return toActionError(error)
  }
  if (target) redirect(target)
  return { ok: true, message: 'OLT actualizada' }
}

export async function deleteOlt(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('olt')
    const id = z.string().parse(formData.get('id'))
    const olt = await prisma.oLT.findFirst({ where: { id, tenantId: user.tenantId }, include: { _count: { select: { onus: true } } } })
    if (!olt) throw new Error('La OLT no existe.')
    if (olt._count.onus > 0) throw new Error('La OLT tiene ONUs registradas en el sistema. Elimínalas o muévelas antes.')
    await prisma.oLT.delete({ where: { id } })
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'olt.delete', entity: 'OLT', entityId: id, details: { name: olt.name } })
  } catch (error) {
    return toActionError(error)
  }
  refresh()
  redirect('/dashboard/olt/list')
}

/** "Actualizar ahora": lee una OLT o todas las de la empresa (solo lectura). */
export async function pollNow(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('olt')
    const id = formData.get('id')?.toString()
    const olts = await prisma.oLT.findMany({ where: { tenantId: user.tenantId, ...(id ? { id } : {}) }, select: { id: true, name: true } })
    if (olts.length === 0) throw new Error('No hay OLTs registradas.')
    const results = []
    for (const o of olts) results.push({ name: o.name, ...(await pollOlt(o.id)) })
    refresh()
    const bad = results.filter((r) => !r.ok)
    if (bad.length === results.length) return { error: bad.map((b) => `${b.name}: ${'error' in b ? b.error : ''}`).join(' · ') }
    const okText = results.filter((r) => r.ok).map((r) => `${r.name}: ${'onus' in r ? r.onus : 0} ONUs`).join(' · ')
    return { ok: true, message: `Leído. ${okText}${bad.length ? ` · ${bad.length} OLT sin respuesta` : ''}` }
  } catch (error) {
    return toActionError(error)
  }
}

// ── ONUs ────────────────────────────────────────────────────────────────────

const onuLinkSchema = z.object({
  name: z.string().max(100).optional(),
  customerId: z.string().optional(),
  onuModelId: z.string().optional(),
  speedPlanId: z.string().optional(),
  napBoxId: z.string().optional(),
  napPort: optInt(1, 128),
  vlan: optInt(1, 4094),
})
const linkData = (d: z.infer<typeof onuLinkSchema>) => ({
  name: d.name ?? null,
  customerId: d.customerId ?? null,
  onuModelId: d.onuModelId ?? null,
  speedPlanId: d.speedPlanId ?? null,
  napBoxId: d.napBoxId ?? null,
  napPort: d.napPort ?? null,
  vlan: d.vlan ?? null,
})

/** Datos de la ONU en el sistema (no cambia nada en la OLT). */
export async function updateOnu(id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('olt')
    await ownOnu(id, user.tenantId)
    const d = onuLinkSchema.parse(formToObject(formData))
    await checkRefs(user.tenantId, d)
    await prisma.oNU.update({ where: { id }, data: linkData(d) })
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'onu.update', entity: 'ONU', entityId: id })
    refresh()
    return { ok: true, message: 'ONU actualizada' }
  } catch (error) {
    return toActionError(error)
  }
}

/** Quita la ONU del sistema (no la desautoriza en la OLT). */
export async function deleteOnu(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('olt')
    const id = z.string().parse(formData.get('id'))
    const onu = await ownOnu(id, user.tenantId)
    await prisma.oNU.delete({ where: { id } })
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'onu.delete', entity: 'ONU', entityId: id, details: { serial: onu.serial } })
    refresh()
    return { ok: true, message: 'ONU quitada del sistema' }
  } catch (error) {
    return toActionError(error)
  }
}

/** Autoriza en la OLT una ONU detectada (Sin autorizar). */
export async function authorizeDiscovery(discoveryId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('olt')
    const d = await prisma.onuDiscovery.findFirst({ where: { id: discoveryId, olt: { tenantId: user.tenantId } } })
    if (!d) throw new Error('La ONU ya no figura como sin autorizar. Actualiza la lectura.')
    const link = onuLinkSchema.parse(formToObject(formData))
    await checkRefs(user.tenantId, link)
    const existing = await prisma.oNU.findFirst({ where: { oltId: d.oltId, serial: d.serial } })
    const onu = existing
      ? await prisma.oNU.update({ where: { id: existing.id }, data: { ...linkData(link), slot: d.slot, port: d.port, authState: 'PENDING' } })
      : await prisma.oNU.create({ data: { ...linkData(link), oltId: d.oltId, serial: d.serial, slot: d.slot, port: d.port, authState: 'PENDING', status: 'UNKNOWN' } })
    const r = await authorizeOnu(onu.id, user.id)
    refresh()
    if (!r.ok) return { error: `No se pudo autorizar: ${r.error}. Quedó en «Pendientes» para reintentar.` }
    return { ok: true, message: `ONU ${d.serial} autorizada (ID ${r.onuId}).` }
  } catch (error) {
    return toActionError(error)
  }
}

/** Pre-autorizar: se registra el serial y se autoriza sola cuando la OLT la detecte. */
export async function preauthorizeOnu(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('olt')
    const raw = formToObject(formData)
    const { serial, oltId } = z.object({ serial: serialRule, oltId: z.string({ required_error: 'Elige la OLT' }) }).parse(raw)
    const link = onuLinkSchema.parse(raw)
    await ownOlt(oltId, user.tenantId)
    await checkRefs(user.tenantId, link)
    if (await prisma.oNU.findFirst({ where: { serial, olt: { tenantId: user.tenantId } } })) throw new Error(`La ONU ${serial} ya está registrada.`)
    const found = await prisma.onuDiscovery.findFirst({ where: { oltId, serial, active: true } })
    const onu = await prisma.oNU.create({
      data: { ...linkData(link), oltId, serial, slot: found?.slot ?? 0, port: found?.port ?? 0, authState: found ? 'PENDING' : 'PREAUTHORIZED', status: 'UNKNOWN' },
    })
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'onu.preauthorize', entity: 'ONU', entityId: onu.id, details: { serial } })
    if (found) {
      const r = await authorizeOnu(onu.id, user.id)
      refresh()
      return r.ok ? { ok: true, message: `La OLT ya la detectaba: ONU ${serial} autorizada.` } : { error: `La OLT ya la detectaba pero no se pudo autorizar: ${r.error}` }
    }
    refresh()
    return { ok: true, message: `ONU ${serial} pre-autorizada: se autorizará sola cuando la OLT la detecte.` }
  } catch (error) {
    return toActionError(error)
  }
}

export async function retryAuthorize(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('olt')
    const id = z.string().parse(formData.get('id'))
    const onu = await ownOnu(id, user.tenantId)
    const found = await prisma.onuDiscovery.findFirst({ where: { oltId: onu.oltId, serial: onu.serial, active: true } })
    if (!found) throw new Error('La OLT no detecta esta ONU todavía (conéctala y espera la próxima lectura).')
    await prisma.oNU.update({ where: { id }, data: { slot: found.slot, port: found.port, authState: 'PENDING' } })
    const r = await authorizeOnu(id, user.id)
    refresh()
    return r.ok ? { ok: true, message: 'ONU autorizada' } : { error: r.error }
  } catch (error) {
    return toActionError(error)
  }
}

// ── Catálogos ───────────────────────────────────────────────────────────────

const modelSchema = z.object({
  name: z.string({ required_error: 'Obligatorio' }).max(80),
  brand: z.enum(['HUAWEI', 'ZTE', 'VSOL']).optional(),
  oltType: z.string().max(60).optional(),
  ethPorts: z.coerce.number().int().min(0).max(16).default(1),
  potsPorts: z.coerce.number().int().min(0).max(8).default(0),
  wifi: z.literal('on').optional(),
  catv: z.literal('on').optional(),
  notes: z.string().max(500).optional(),
})

export async function saveOnuModel(id: string | null, _: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('olt')
    const d = modelSchema.parse(formToObject(formData))
    const data = { ...d, brand: d.brand ?? null, oltType: d.oltType ?? null, notes: d.notes ?? null, wifi: d.wifi === 'on', catv: d.catv === 'on' }
    if (id) {
      const r = await prisma.onuModel.updateMany({ where: { id, tenantId: user.tenantId }, data })
      if (!r.count) throw new Error('El modelo no existe.')
    } else await prisma.onuModel.create({ data: { ...data, tenantId: user.tenantId } })
    refresh()
    return { ok: true, message: id ? 'Modelo actualizado' : 'Modelo creado' }
  } catch (error) {
    return toActionError(error)
  }
}

const planSchema = z.object({
  name: z.string({ required_error: 'Obligatorio' }).max(80),
  download: z.coerce.number({ invalid_type_error: 'Número' }).int().min(1).max(100000),
  upload: z.coerce.number({ invalid_type_error: 'Número' }).int().min(1).max(100000),
  lineProfile: z.string().max(60).optional(),
  srvProfile: z.string().max(60).optional(),
  vlan: optInt(1, 4094),
  notes: z.string().max(500).optional(),
})

export async function saveSpeedPlan(id: string | null, _: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('olt')
    const d = planSchema.parse(formToObject(formData))
    const data = { ...d, lineProfile: d.lineProfile ?? null, srvProfile: d.srvProfile ?? null, vlan: d.vlan ?? null, notes: d.notes ?? null }
    if (id) {
      const r = await prisma.oltSpeedPlan.updateMany({ where: { id, tenantId: user.tenantId }, data })
      if (!r.count) throw new Error('El plan no existe.')
    } else await prisma.oltSpeedPlan.create({ data: { ...data, tenantId: user.tenantId } })
    refresh()
    return { ok: true, message: id ? 'Plan actualizado' : 'Plan creado' }
  } catch (error) {
    return toActionError(error)
  }
}

const napSchema = z.object({
  name: z.string({ required_error: 'Obligatorio' }).max(80),
  coordinates: coords,
  address: z.string().max(200).optional(),
  capacity: z.coerce.number().int().min(1).max(128).default(8),
  splitter: z.string().max(20).optional(),
  oltId: z.string().optional(),
  ponSlot: optInt(0, 64),
  ponPort: optInt(0, 128),
  notes: z.string().max(500).optional(),
})

export async function saveNap(id: string | null, _: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('olt')
    const d = napSchema.parse(formToObject(formData))
    if (d.oltId) await ownOlt(d.oltId, user.tenantId)
    const data = {
      ...d,
      coordinates: d.coordinates ?? null,
      address: d.address ?? null,
      splitter: d.splitter ?? null,
      oltId: d.oltId ?? null,
      ponSlot: d.ponSlot ?? null,
      ponPort: d.ponPort ?? null,
      notes: d.notes ?? null,
    }
    if (id) {
      const r = await prisma.napBox.updateMany({ where: { id, tenantId: user.tenantId }, data })
      if (!r.count) throw new Error('La caja no existe.')
    } else await prisma.napBox.create({ data: { ...data, tenantId: user.tenantId } })
    refresh()
    return { ok: true, message: id ? 'Caja NAP actualizada' : 'Caja NAP creada' }
  } catch (error) {
    return toActionError(error)
  }
}

/** Borra un registro de catálogo (modelo, plan de velocidad o caja NAP); las ONUs quedan sin ese dato. */
export async function deleteCatalog(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('olt')
    const { id, kind } = z.object({ id: z.string(), kind: z.enum(['model', 'plan', 'nap']) }).parse(formToObject(formData))
    const where = { id, tenantId: user.tenantId }
    const r =
      kind === 'model'
        ? await prisma.onuModel.deleteMany({ where })
        : kind === 'plan'
          ? await prisma.oltSpeedPlan.deleteMany({ where })
          : await prisma.napBox.deleteMany({ where })
    if (!r.count) throw new Error('El registro no existe.')
    await audit({ tenantId: user.tenantId, userId: user.id, action: `olt.${kind}.delete`, entity: 'OLT', entityId: id })
    refresh()
    return { ok: true, message: 'Eliminado' }
  } catch (error) {
    return toActionError(error)
  }
}

// ── Alertas ─────────────────────────────────────────────────────────────────

export async function saveOltSettings(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('olt')
    const d = z
      .object({
        lowSignal: z.coerce.number().min(-40).max(0),
        criticalSignal: z.coerce.number().min(-40).max(0),
        variationDb: z.coerce.number().min(0.5).max(20),
        pollMinutes: z.coerce.number().int().min(1).max(120),
        autoAuthorize: z.literal('on').optional(),
      })
      .parse(formToObject(formData))
    if (d.criticalSignal > d.lowSignal) return { error: 'Revisa los campos marcados.', fieldErrors: { criticalSignal: ['Debe ser menor o igual que la señal baja'] } }
    const data = { ...d, autoAuthorize: d.autoAuthorize === 'on' }
    await prisma.oltSettings.upsert({ where: { tenantId: user.tenantId }, update: data, create: { ...data, tenantId: user.tenantId } })
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'olt.settings', entity: 'OLT', details: data })
    refresh()
    return { ok: true, message: 'Alertas guardadas' }
  } catch (error) {
    return toActionError(error)
  }
}

export async function resolveEvent(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('olt')
    const id = z.string().parse(formData.get('id'))
    const r = await prisma.ponEvent.updateMany({ where: { id, tenantId: user.tenantId, resolvedAt: null }, data: { resolvedAt: new Date() } })
    if (!r.count) throw new Error('El evento ya estaba cerrado.')
    refresh()
    return { ok: true, message: 'Evento cerrado' }
  } catch (error) {
    return toActionError(error)
  }
}

// ── Pruebas de conexión ─────────────────────────────────────────────────────

/** «Probar consola»: ejecuta comandos de solo consulta y devuelve la salida para ajustar las plantillas. */
export async function probeConsole(oltId: string, commands: string) {
  try {
    const user = await requireActionUser('olt')
    const olt = await ownOlt(oltId, user.tenantId)
    const cli = driverConfig(olt).cli
    if (!cli) return { error: 'Configura primero el usuario y la clave de consola de esta OLT.' }
    const r = await testConsole(cli, commands)
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'olt.console', entity: 'OLT', entityId: olt.id, details: { commands: commands.slice(0, 500) } })
    return {
      output: r.output,
      onus: r.onus.slice(0, 50).map((o) => `${o.slot}/${o.port}:${o.onuId} ${o.serial} · ${o.status}${o.rxPower != null ? ` · ${o.rxPower} dBm` : ''}`),
      onuCount: r.onus.length,
      discovered: r.discovered.slice(0, 50).map((d) => `${d.slot}/${d.port} ${d.serial}`),
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Error desconocido' }
  }
}

/** «Probar SNMP»: lee descripción, nombre y tiempo encendida (estándar en todas las marcas). */
export async function probeSnmp(oltId: string) {
  try {
    const user = await requireActionUser('olt')
    const olt = await ownOlt(oltId, user.tenantId)
    const target = snmpTarget(olt)
    if (!target) return { error: 'Esta OLT no tiene SNMP configurado (comunidad o usuario v3).' }
    const info = await systemInfo(target)
    await prisma.oLT.update({ where: { id: olt.id }, data: { sysDescr: info.descr?.slice(0, 300) ?? null } })
    refresh()
    return { info }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Error desconocido' }
  }
}
