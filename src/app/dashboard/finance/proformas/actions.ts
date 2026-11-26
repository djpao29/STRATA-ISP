'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireActionUser } from '@/lib/session'
import { audit } from '@/lib/audit'
import { formToObject, toActionError, type ActionState } from '@/lib/actions'
import { nextInvoiceNumber } from '@/lib/billing'
import { dateInput } from '@/lib/payments'
import { todayIn } from '@/lib/dates'

const itemSchema = z.object({
  description: z.string().min(1, 'Describe el concepto').max(300),
  quantity: z.coerce.number().positive('Cantidad mayor que 0').max(100000),
  unitPrice: z.coerce.number().min(0, 'Precio no negativo').max(1_000_000),
})

/** Lee las líneas "items[0][description]", "items[0][quantity]"… del formulario. */
function parseItems(formData: FormData) {
  const rows = new Map<number, Record<string, string>>()
  formData.forEach((value, key) => {
    const m = /^items\[(\d+)\]\[(description|quantity|unitPrice)\]$/.exec(key)
    if (!m || typeof value !== 'string') return
    const i = Number(m[1])
    rows.set(i, { ...(rows.get(i) ?? {}), [m[2]]: value.trim() })
  })
  const items = [...rows.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, r]) => r)
    .filter((r) => r.description || r.unitPrice)
    .map((r) => itemSchema.parse(r))
  if (items.length === 0) throw new Error('Agrega al menos una línea a la proforma.')
  return items
}

const cents = (n: number) => Math.round(n * 100) / 100

export async function createProforma(_: ActionState, formData: FormData): Promise<ActionState> {
  let id: string
  try {
    const user = await requireActionUser('finance')
    const head = z
      .object({
        customerId: z.string().optional(),
        clientName: z.string().max(150).optional(),
        clientInfo: z.string().max(300).optional(),
        validUntil: dateInput,
        notes: z.string().max(1000).optional(),
      })
      .parse(formToObject(formData))
    if (!head.customerId && !head.clientName) {
      return { error: 'Revisa los campos marcados.', fieldErrors: { clientName: ['Elige un cliente o escribe el nombre del prospecto'] } }
    }
    if (head.customerId) {
      const c = await prisma.customer.findFirst({ where: { id: head.customerId, tenantId: user.tenantId } })
      if (!c) throw new Error('El cliente no existe.')
    }
    const items = parseItems(formData)
    const total = cents(items.reduce((s, i) => s + i.quantity * i.unitPrice, 0))
    const issueDate = todayIn(user.tenant.timezone)
    if (head.validUntil < issueDate) return { error: 'Revisa los campos marcados.', fieldErrors: { validUntil: ['No puede ser anterior a hoy'] } }

    const proforma = await prisma.$transaction(async (tx) => {
      const t = await tx.tenant.update({ where: { id: user.tenantId }, data: { nextProformaNumber: { increment: 1 } }, select: { nextProformaNumber: true } })
      return tx.proforma.create({
        data: {
          tenantId: user.tenantId,
          number: `PF-${String(t.nextProformaNumber - 1).padStart(6, '0')}`,
          customerId: head.customerId,
          clientName: head.customerId ? null : head.clientName,
          clientInfo: head.clientInfo,
          issueDate,
          validUntil: head.validUntil,
          notes: head.notes,
          total,
          items: { create: items.map((it, i) => ({ ...it, sortOrder: i })) },
        },
      })
    })
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'proforma.create', entity: 'Proforma', entityId: proforma.id, details: { number: proforma.number, total } })
    id = proforma.id
  } catch (error) {
    return toActionError(error)
  }
  revalidatePath('/dashboard/finance/proformas')
  redirect(`/dashboard/finance/proformas/${id}`)
}

export async function setProformaStatus(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('finance')
    const { id, status } = z
      .object({ id: z.string(), status: z.enum(['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED']) })
      .parse(formToObject(formData))
    const p = await prisma.proforma.findFirst({ where: { id, tenantId: user.tenantId } })
    if (!p) throw new Error('La proforma no existe.')
    if (p.status === 'INVOICED') throw new Error('La proforma ya se convirtió en factura.')
    await prisma.proforma.update({ where: { id }, data: { status } })
    revalidatePath(`/dashboard/finance/proformas/${id}`)
    revalidatePath('/dashboard/finance/proformas')
    return { ok: true, message: 'Estado actualizado' }
  } catch (error) {
    return toActionError(error)
  }
}

/** Convierte la proforma en una factura real (una sola vez). */
export async function convertProforma(id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  let invoiceId: string
  try {
    const user = await requireActionUser('billing')
    const data = z.object({ customerId: z.string().optional(), dueDate: dateInput }).parse(formToObject(formData))
    const p = await prisma.proforma.findFirst({ where: { id, tenantId: user.tenantId }, include: { items: { orderBy: { sortOrder: 'asc' } } } })
    if (!p) throw new Error('La proforma no existe.')
    if (p.invoiceId) throw new Error('La proforma ya se convirtió en factura.')
    if (p.status === 'REJECTED') throw new Error('La proforma está rechazada.')
    const customerId = p.customerId ?? data.customerId
    if (!customerId) return { error: 'Revisa los campos marcados.', fieldErrors: { customerId: ['Elige el cliente que recibirá la factura'] } }
    const customer = await prisma.customer.findFirst({ where: { id: customerId, tenantId: user.tenantId } })
    if (!customer) throw new Error('El cliente no existe.')

    const description = `Proforma ${p.number}: ${p.items.map((i) => i.description).join(', ')}`.slice(0, 300)
    const invoice = await prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.create({
        data: {
          number: await nextInvoiceNumber(tx, user.tenantId),
          description,
          amount: p.total,
          issueDate: todayIn(user.tenant.timezone),
          dueDate: data.dueDate,
          customerId,
          tenantId: user.tenantId,
        },
      })
      await tx.proforma.update({ where: { id }, data: { status: 'INVOICED', invoiceId: inv.id, customerId } })
      return inv
    })
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'proforma.invoice', entity: 'Proforma', entityId: id, details: { invoice: invoice.number } })
    invoiceId = invoice.id
  } catch (error) {
    return toActionError(error)
  }
  revalidatePath('/dashboard/finance/proformas')
  redirect(`/dashboard/billing/${invoiceId}`)
}

export async function deleteProforma(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('finance')
    const id = z.string().parse(formData.get('id'))
    const p = await prisma.proforma.findFirst({ where: { id, tenantId: user.tenantId } })
    if (!p) throw new Error('La proforma no existe.')
    if (p.invoiceId) throw new Error('No se puede eliminar: ya generó una factura.')
    await prisma.proforma.delete({ where: { id } })
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'proforma.delete', entity: 'Proforma', entityId: id, details: { number: p.number } })
  } catch (error) {
    return toActionError(error)
  }
  revalidatePath('/dashboard/finance/proformas')
  redirect('/dashboard/finance/proformas')
}
