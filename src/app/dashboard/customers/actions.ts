'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireActionUser } from '@/lib/session'
import { audit } from '@/lib/audit'
import { formToObject, optionalText, toActionError, type ActionState } from '@/lib/actions'
import { createCustomerWithService } from '@/lib/onboarding'
import { processSoon, reconnectCustomer, suspendCustomer } from '@/lib/zones/network'

const phoneRule = /^\+?[0-9 ()-]{7,20}$/

const customerSchema = z.object({
  cedula: z
    .string()
    .regex(/^[0-9A-Za-z-]{5,20}$/, 'Cédula, RUC o pasaporte (5 a 20 caracteres, sin espacios)')
    .optional(),
  firstName: z.string({ required_error: 'Obligatorio' }).max(100),
  lastName: z.string({ required_error: 'Obligatorio' }).max(100),
  email: z.string().email('Correo inválido').max(200).optional(),
  email2: z.string().email('Correo inválido').max(200).optional(),
  phone: z.string({ required_error: 'Obligatorio' }).regex(phoneRule, 'Teléfono inválido'),
  phone2: z.string().regex(phoneRule, 'Teléfono inválido').optional(),
  address: optionalText(300),
  province: optionalText(100),
  city: optionalText(100),
  neighborhood: optionalText(100),
  coordinates: z
    .string()
    .regex(/^-?\d{1,2}(\.\d+)?,\s*-?\d{1,3}(\.\d+)?$/, 'Formato: latitud,longitud (ej. -2.17,-79.92)')
    .optional(),
  notes: optionalText(2000),
  status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED', 'CANCELLED']).default('PENDING'),
  zoneId: z.string({ required_error: 'Elige la zona de facturación' }),
  suspendExempt: z.literal('on').optional(),
})

async function assertZone(zoneId: string, tenantId: string) {
  const zone = await prisma.zone.findFirst({ where: { id: zoneId, tenantId } })
  if (!zone) throw new Error('La zona elegida no existe.')
  return zone
}

/** Campos opcionales vacíos se guardan como null (para poder borrarlos al editar). */
function nullable<T extends Record<string, unknown>>(data: T, keys: Array<keyof T>) {
  const out = { ...data } as Record<string, unknown>
  keys.forEach((k) => (out[k as string] = data[k] ?? null))
  return out as T
}

const OPTIONAL_KEYS = ['cedula', 'email', 'email2', 'phone2', 'address', 'province', 'city', 'neighborhood', 'coordinates', 'notes'] as const

async function findOwned(id: string, tenantId: string) {
  const customer = await prisma.customer.findFirst({ where: { id, tenantId } })
  if (!customer) throw new Error('El cliente no existe.')
  return customer
}

const ipv6Rule = /^[0-9A-Fa-f:]{2,39}(\/\d{1,3})?$/
const ifaceName = z.string().max(60).regex(/^[\w .:/@-]+$/, 'Nombre de interfaz inválido')

/** Campos del alta: servicio, equipo, ONU y factura (todos opcionales salvo que haya plan). */
const onboardingSchema = z.object({
  planId: z.string().optional(),
  routerId: z.string().optional(),
  mode: z.enum(['PPPoE', 'DHCP', 'STATIC_IP']).optional(),
  ipAddress: z.string().regex(/^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/, 'IPv4 inválida').optional(),
  ipv6: z.string().regex(ipv6Rule, 'IPv6 inválida').optional(),
  macAddress: z.string().regex(/^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/, 'MAC inválida (aa:bb:cc:dd:ee:ff)').optional(),
  lanInterface: ifaceName.optional(),
  wanInterface: ifaceName.optional(),
  pppoeUser: z.string().max(100).regex(/^[\w.@-]+$/, 'Sin espacios: letras, números, punto, guion o @').optional(),
  pppoePassword: z.string().min(4, 'Mínimo 4 caracteres').max(64).optional(),
  discount: z.coerce.number().min(0, 'No puede ser negativo').max(1_000_000).optional(),
  discountNote: optionalText(120),
  accessType: z.enum(['FIBER', 'ANTENNA']).optional(),
  accessPoint: optionalText(100),
  onuId: z.string().optional(),
  newOnu: z.literal('on').optional(),
  onuOltId: z.string().optional(),
  onuSerial: z.string().max(40).regex(/^[0-9A-Za-z-]{4,40}$/, 'Serial inválido').optional(),
  onuSlot: z.coerce.number().int().min(0).max(255).optional(),
  onuPort: z.coerce.number().int().min(0).max(255).optional(),
  syncRouter: z.enum(['on', 'off']).default('on'),
  deviceModel: optionalText(60),
  invoiceNow: z.literal('on').optional(),
  invoiceMode: z.enum(['prorated', 'full']).default('prorated'),
})

export async function createCustomer(_: ActionState, formData: FormData): Promise<ActionState> {
  let target: string
  try {
    const user = await requireActionUser('customersWrite')
    const raw = formToObject(formData)
    const { suspendExempt, status, ...data } = customerSchema.parse(raw)
    const o = onboardingSchema.parse(raw)

    const plan = o.planId ? await prisma.plan.findFirst({ where: { id: o.planId, tenantId: user.tenantId }, select: { kind: true, price: true } }) : null
    if (o.planId && !plan) throw new Error('El plan elegido no existe.')
    const fieldError = (field: string, message: string) => new z.ZodError([{ code: 'custom', path: [field], message }])
    if (plan?.kind === 'PPPOE' && !o.pppoeUser) throw fieldError('pppoeUser', 'Obligatorio para planes PPPoE')
    if ((o.discount ?? 0) > 0 && plan && (o.discount ?? 0) > Number(plan.price)) throw fieldError('discount', 'Mayor que el precio del plan')
    if (o.newOnu && !o.onuSerial) throw fieldError('onuSerial', 'Obligatorio')
    if (o.newOnu && !o.onuOltId) throw fieldError('onuOltId', 'Elige la OLT')

    const r = await createCustomerWithService({
      tenantId: user.tenantId,
      userId: user.id,
      customer: { ...data, status: status === 'PENDING' ? 'PENDING' : 'ACTIVE', suspendExempt: suspendExempt === 'on' },
      service: plan
        ? {
            planId: o.planId!,
            routerId: o.routerId ?? null,
            mode: plan.kind === 'PPPOE' ? 'PPPoE' : o.mode === 'DHCP' ? 'DHCP' : 'STATIC_IP',
            ipAddress: o.ipAddress ?? null,
            ipv6: o.ipv6 ?? null,
            macAddress: o.macAddress ? o.macAddress.toUpperCase().replace(/-/g, ':') : null,
            pppoeUser: plan.kind === 'PPPOE' ? o.pppoeUser ?? null : null,
            pppoePassword: plan.kind === 'PPPOE' ? o.pppoePassword ?? null : null,
            lanInterface: o.lanInterface ?? null,
            wanInterface: o.wanInterface ?? null,
            discount: o.discount ?? 0,
            discountNote: (o.discount ?? 0) > 0 ? o.discountNote ?? null : null,
            accessType: o.accessType ?? null,
            accessPoint: o.accessType === 'ANTENNA' ? o.accessPoint ?? null : null,
            syncRouter: o.syncRouter === 'on',
          }
        : undefined,
      deviceModel: o.deviceModel ?? null,
      onu:
        o.accessType === 'FIBER'
          ? o.newOnu
            ? { create: { oltId: o.onuOltId!, serial: o.onuSerial!, slot: o.onuSlot ?? 0, port: o.onuPort ?? 0 } }
            : { existingId: o.onuId ?? null }
          : undefined,
      invoice: o.invoiceNow && plan ? { mode: o.invoiceMode } : null,
    })
    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'customer.create',
      entity: 'Customer',
      entityId: r.customer.id,
      details: { serviceId: r.serviceId, invoice: r.invoice?.number ?? null, network: r.network?.message ?? null },
    })
    const notes = [
      r.invoice ? `Factura ${r.invoice.number} generada.` : null,
      r.network?.message ?? null,
    ].filter(Boolean)
    const q = new URLSearchParams()
    if (notes.length) q.set('alta', notes.join(' '))
    if (r.network && !r.network.ok) q.set('altaError', '1')
    target = `/dashboard/customers/${r.customer.id}${q.toString() ? `?${q}` : ''}`
  } catch (error) {
    return toActionError(error)
  }
  revalidatePath('/dashboard/customers')
  redirect(target)
}

export async function updateCustomer(id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('customersWrite')
    const before = await findOwned(id, user.tenantId)
    const { suspendExempt, ...parsed } = customerSchema.parse(formToObject(formData))
    const data = nullable(parsed, [...OPTIONAL_KEYS])
    const zone = await assertZone(data.zoneId, user.tenantId)
    // El estado se cambia con los botones de la ficha (que también actúan en el router), no aquí.
    const { status: _ignored, ...rest } = data
    await prisma.customer.update({ where: { id }, data: { ...rest, suspendExempt: suspendExempt === 'on' } })
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'customer.update', entity: 'Customer', entityId: id })
    if (before.zoneId !== zone.id) await logZoneChange(user, id, before.zoneId, zone.id)
  } catch (error) {
    return toActionError(error)
  }
  revalidatePath('/dashboard/customers')
  redirect(`/dashboard/customers/${id}`)
}

export async function setCustomerStatus(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('customersWrite')
    const { id, status } = z
      .object({ id: z.string(), status: customerSchema.shape.status })
      .parse(formToObject(formData))
    const customer = await findOwned(id, user.tenantId)
    const reason = `Cambio manual a ${status === 'SUSPENDED' ? 'suspendido' : status === 'CANCELLED' ? 'cancelado' : status === 'ACTIVE' ? 'activo' : 'pendiente'}`
    let network = ''
    if (status === 'SUSPENDED' || status === 'CANCELLED') {
      // Cortar en el router; para "cancelado" se corta y luego se deja el estado cancelado.
      const r = await suspendCustomer(id, 'MANUAL', reason, user.id)
      if (status === 'CANCELLED') await prisma.customer.update({ where: { id }, data: { status: 'CANCELLED' } })
      network = r?.queued ? ` · corte enviado a ${r.queued} servicio(s)` : ''
    } else if (status === 'ACTIVE' && (customer.status === 'SUSPENDED' || customer.status === 'CANCELLED')) {
      const r = await reconnectCustomer(id, 'MANUAL', reason, user.id)
      network = r?.queued ? ` · reconexión enviada a ${r.queued} servicio(s)` : ''
    } else {
      await prisma.customer.update({ where: { id }, data: { status } })
    }
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'customer.status', entity: 'Customer', entityId: id, details: { status } })
    processSoon(id)
    revalidatePath(`/dashboard/customers/${id}`)
    revalidatePath('/dashboard/customers')
    return { ok: true, message: `Estado actualizado${network}` }
  } catch (error) {
    return toActionError(error)
  }
}

export async function deleteCustomer(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('customersWrite')
    const id = z.string().parse(formData.get('id'))
    await findOwned(id, user.tenantId)
    const [invoices, payments] = await Promise.all([
      prisma.invoice.count({ where: { customerId: id } }),
      prisma.payment.count({ where: { customerId: id } }),
    ])
    if (invoices + payments > 0) {
      throw new Error('El cliente tiene facturas o pagos. Cámbialo a "Cancelado" en lugar de eliminarlo.')
    }
    await prisma.$transaction([
      prisma.ticket.deleteMany({ where: { customerId: id } }),
      prisma.customer.delete({ where: { id } }),
    ])
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'customer.delete', entity: 'Customer', entityId: id })
  } catch (error) {
    return toActionError(error)
  }
  revalidatePath('/dashboard/customers')
  redirect('/dashboard/customers')
}

// ── Servicios ────────────────────────────────────────────────

const ipv4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/
const mac = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/

const serviceSchema = z.object({
  planId: z.string({ required_error: 'Elige un plan' }),
  routerId: z.string().optional(),
  mode: z.enum(['PPPoE', 'DHCP', 'STATIC_IP']).default('PPPoE'),
  ipAddress: z.string().regex(ipv4, 'IPv4 inválida').optional(),
  macAddress: z.string().regex(mac, 'MAC inválida (AA:BB:CC:DD:EE:FF)').optional(),
  pppoeUser: z.string().max(100).optional(),
})

export async function addService(customerId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('customersWrite')
    await findOwned(customerId, user.tenantId)
    const data = serviceSchema.parse(formToObject(formData))

    const plan = await prisma.plan.findFirst({ where: { id: data.planId, tenantId: user.tenantId, isActive: true } })
    if (!plan) throw new Error('El plan elegido no existe o está inactivo.')
    if (data.routerId) {
      const router = await prisma.router.findFirst({ where: { id: data.routerId, tenantId: user.tenantId } })
      if (!router) throw new Error('El router elegido no existe.')
    }

    const service = await prisma.service.create({ data: { ...data, customerId, tenantId: user.tenantId } })
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'service.create', entity: 'Service', entityId: service.id, details: { customerId, planId: plan.id } })
    revalidatePath(`/dashboard/customers/${customerId}`)
    return { ok: true, message: 'Servicio agregado' }
  } catch (error) {
    return toActionError(error)
  }
}

export async function toggleService(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('customersWrite')
    const id = z.string().parse(formData.get('id'))
    const service = await prisma.service.findFirst({ where: { id, tenantId: user.tenantId } })
    if (!service) throw new Error('El servicio no existe.')
    await prisma.service.update({ where: { id }, data: { isActive: !service.isActive } })
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'service.toggle', entity: 'Service', entityId: id, details: { isActive: !service.isActive } })
    revalidatePath(`/dashboard/customers/${service.customerId}`)
    return { ok: true, message: service.isActive ? 'Servicio desactivado' : 'Servicio activado' }
  } catch (error) {
    return toActionError(error)
  }
}

export async function deleteService(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('customersWrite')
    const id = z.string().parse(formData.get('id'))
    const service = await prisma.service.findFirst({ where: { id, tenantId: user.tenantId } })
    if (!service) throw new Error('El servicio no existe.')
    await prisma.service.delete({ where: { id } })
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'service.delete', entity: 'Service', entityId: id })
    revalidatePath(`/dashboard/customers/${service.customerId}`)
    return { ok: true, message: 'Servicio eliminado' }
  } catch (error) {
    return toActionError(error)
  }
}

async function logZoneChange(user: { id: string; tenantId: string }, customerId: string, fromId: string | null, toId: string) {
  const zones = await prisma.zone.findMany({ where: { id: { in: [fromId, toId].filter(Boolean) as string[] } }, select: { id: true, name: true } })
  const name = (zid: string | null) => zones.find((z) => z.id === zid)?.name ?? null
  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'customer.zone',
    entity: 'Customer',
    entityId: customerId,
    details: { fromId, toId, fromName: name(fromId), toName: name(toId) },
  })
}

/**
 * Cambio de zona desde la ficha. No toca facturas ni pagos anteriores: las facturas emitidas
 * conservan sus fechas, y la nueva zona factura al cliente a partir de su siguiente ciclo
 * (un periodo ya facturado nunca se vuelve a facturar).
 */
export async function changeZone(customerId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('customersWrite')
    const zoneId = z.string({ required_error: 'Elige una zona' }).parse(formToObject(formData).zoneId)
    const customer = await findOwned(customerId, user.tenantId)
    const zone = await assertZone(zoneId, user.tenantId)
    if (customer.zoneId === zone.id) return { ok: true, message: 'El cliente ya está en esa zona' }
    await prisma.customer.update({ where: { id: customerId }, data: { zoneId: zone.id } })
    await logZoneChange(user, customerId, customer.zoneId, zone.id)
    revalidatePath(`/dashboard/customers/${customerId}`)
    return { ok: true, message: `Cliente movido a ${zone.name}` }
  } catch (error) {
    return toActionError(error)
  }
}
