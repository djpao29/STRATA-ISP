'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireActionUser } from '@/lib/session'
import { audit } from '@/lib/audit'
import { formToObject, optionalText, toActionError, type ActionState } from '@/lib/actions'

const customerSchema = z.object({
  cedula: z
    .string({ required_error: 'Obligatorio' })
    .regex(/^[0-9A-Za-z-]{5,20}$/, 'Cédula, RUC o pasaporte (5 a 20 caracteres, sin espacios)'),
  firstName: z.string({ required_error: 'Obligatorio' }).max(100),
  lastName: z.string({ required_error: 'Obligatorio' }).max(100),
  email: z.string().email('Correo inválido').max(200).optional(),
  phone: z.string({ required_error: 'Obligatorio' }).regex(/^\+?[0-9 ]{7,20}$/, 'Teléfono inválido'),
  address: optionalText(300),
  city: optionalText(100),
  neighborhood: optionalText(100),
  coordinates: z
    .string()
    .regex(/^-?\d{1,2}(\.\d+)?,\s*-?\d{1,3}(\.\d+)?$/, 'Formato: latitud,longitud (ej. -2.17,-79.92)')
    .optional(),
  notes: optionalText(2000),
  status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED', 'CANCELLED']).default('PENDING'),
})

/** Campos opcionales vacíos se guardan como null (para poder borrarlos al editar). */
function nullable<T extends Record<string, unknown>>(data: T, keys: Array<keyof T>) {
  const out = { ...data } as Record<string, unknown>
  keys.forEach((k) => (out[k as string] = data[k] ?? null))
  return out as T
}

const OPTIONAL_KEYS = ['email', 'address', 'city', 'neighborhood', 'coordinates', 'notes'] as const

async function findOwned(id: string, tenantId: string) {
  const customer = await prisma.customer.findFirst({ where: { id, tenantId } })
  if (!customer) throw new Error('El cliente no existe.')
  return customer
}

export async function createCustomer(_: ActionState, formData: FormData): Promise<ActionState> {
  let id: string
  try {
    const user = await requireActionUser('customersWrite')
    const data = customerSchema.parse(formToObject(formData))
    const customer = await prisma.customer.create({ data: { ...data, tenantId: user.tenantId } })
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'customer.create', entity: 'Customer', entityId: customer.id })
    id = customer.id
  } catch (error) {
    return toActionError(error)
  }
  revalidatePath('/dashboard/customers')
  redirect(`/dashboard/customers/${id}`)
}

export async function updateCustomer(id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('customersWrite')
    await findOwned(id, user.tenantId)
    const data = nullable(customerSchema.parse(formToObject(formData)), [...OPTIONAL_KEYS])
    await prisma.customer.update({ where: { id }, data })
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'customer.update', entity: 'Customer', entityId: id })
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
    await findOwned(id, user.tenantId)
    await prisma.customer.update({ where: { id }, data: { status } })
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'customer.status', entity: 'Customer', entityId: id, details: { status } })
    revalidatePath(`/dashboard/customers/${id}`)
    revalidatePath('/dashboard/customers')
    return { ok: true, message: 'Estado actualizado' }
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
