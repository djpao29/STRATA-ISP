'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireActionUser } from '@/lib/session'
import { audit } from '@/lib/audit'
import { decrypt, encrypt } from '@/lib/crypto'
import { formToObject, toActionError, type ActionState } from '@/lib/actions'

const MAC = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/
const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/

const deviceSchema = z.object({
  customerId: z.string({ required_error: 'Elige el cliente' }),
  serviceId: z.string().optional(),
  brand: z.string().max(60).optional(),
  model: z.string().max(60).optional(),
  serial: z.string().max(80).optional(),
  macAddress: z.string().regex(MAC, 'MAC inválida (ej. AA:BB:CC:DD:EE:FF)').optional(),
  managementIp: z.string().regex(IPV4, 'IP inválida').optional(),
  ssid: z.string().max(64).optional(),
  wifiPassword: z.string().min(8, 'La clave WiFi debe tener al menos 8 caracteres').max(63).optional(),
  adminUser: z.string().max(60).optional(),
  adminPassword: z.string().max(120).optional(),
  band: z.enum(['2.4 GHz', '5 GHz', '2.4 y 5 GHz']).optional(),
  notes: z.string().max(1000).optional(),
  clearWifi: z.literal('on').optional(),
  clearAdmin: z.literal('on').optional(),
})

function revalidate(customerId: string) {
  revalidatePath('/dashboard/customers/devices')
  revalidatePath(`/dashboard/customers/${customerId}`)
}

/** Crea (id null) o edita un equipo. En edición, dejar una clave vacía la conserva. */
export async function saveDevice(id: string | null, _: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('devices')
    const data = deviceSchema.parse(formToObject(formData))
    const customer = await prisma.customer.findFirst({ where: { id: data.customerId, tenantId: user.tenantId } })
    if (!customer) throw new Error('El cliente no existe.')
    if (data.serviceId) {
      const service = await prisma.service.findFirst({ where: { id: data.serviceId, customerId: customer.id } })
      if (!service) throw new Error('El servicio no pertenece a ese cliente.')
    }

    const fields = {
      customerId: customer.id,
      serviceId: data.serviceId ?? null,
      brand: data.brand ?? null,
      model: data.model ?? null,
      serial: data.serial ?? null,
      macAddress: data.macAddress?.toUpperCase().replace(/-/g, ':') ?? null,
      managementIp: data.managementIp ?? null,
      ssid: data.ssid ?? null,
      adminUser: data.adminUser ?? null,
      band: data.band ?? null,
      notes: data.notes ?? null,
    }

    if (id) {
      const current = await prisma.customerDevice.findFirst({ where: { id, tenantId: user.tenantId } })
      if (!current) throw new Error('El equipo no existe.')
      await prisma.customerDevice.update({
        where: { id },
        data: {
          ...fields,
          ...(data.wifiPassword ? { wifiPasswordEnc: encrypt(data.wifiPassword) } : data.clearWifi ? { wifiPasswordEnc: null } : {}),
          ...(data.adminPassword ? { adminPasswordEnc: encrypt(data.adminPassword) } : data.clearAdmin ? { adminPasswordEnc: null } : {}),
        },
      })
      await audit({
        tenantId: user.tenantId,
        userId: user.id,
        action: 'device.update',
        entity: 'Customer',
        entityId: customer.id,
        details: { deviceId: id, wifiPasswordChanged: !!data.wifiPassword || !!data.clearWifi, adminPasswordChanged: !!data.adminPassword || !!data.clearAdmin },
      })
      if (current.customerId !== customer.id) revalidate(current.customerId)
    } else {
      const device = await prisma.customerDevice.create({
        data: {
          ...fields,
          tenantId: user.tenantId,
          wifiPasswordEnc: data.wifiPassword ? encrypt(data.wifiPassword) : null,
          adminPasswordEnc: data.adminPassword ? encrypt(data.adminPassword) : null,
        },
      })
      await audit({ tenantId: user.tenantId, userId: user.id, action: 'device.create', entity: 'Customer', entityId: customer.id, details: { deviceId: device.id } })
    }
    revalidate(customer.id)
    return { ok: true, message: id ? 'Equipo actualizado' : 'Equipo registrado' }
  } catch (error) {
    return toActionError(error)
  }
}

export async function deleteDevice(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('devices')
    const { id } = z.object({ id: z.string() }).parse(formToObject(formData))
    const device = await prisma.customerDevice.findFirst({ where: { id, tenantId: user.tenantId } })
    if (!device) throw new Error('El equipo no existe.')
    await prisma.customerDevice.delete({ where: { id } })
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'device.delete', entity: 'Customer', entityId: device.customerId, details: { deviceId: id, serial: device.serial, mac: device.macAddress } })
    revalidate(device.customerId)
    return { ok: true, message: 'Equipo eliminado' }
  } catch (error) {
    return toActionError(error)
  }
}

/** Muestra una clave guardada. Cada consulta queda registrada en la auditoría. */
export async function revealDeviceSecret(id: string, which: 'wifi' | 'admin'): Promise<{ value?: string; error?: string }> {
  try {
    const user = await requireActionUser('devices')
    const device = await prisma.customerDevice.findFirst({ where: { id, tenantId: user.tenantId } })
    if (!device) return { error: 'El equipo no existe.' }
    const enc = which === 'wifi' ? device.wifiPasswordEnc : device.adminPasswordEnc
    if (!enc) return { error: 'No hay clave guardada.' }
    const value = decrypt(enc)
    await audit({ tenantId: user.tenantId, userId: user.id, action: `device.reveal_${which}`, entity: 'Customer', entityId: device.customerId, details: { deviceId: id } })
    return { value }
  } catch (error) {
    console.error('[equipos] revelar clave', error)
    return { error: 'No se pudo leer la clave (¿cambió ENCRYPTION_KEY?).' }
  }
}
