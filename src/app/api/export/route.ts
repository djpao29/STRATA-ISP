import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { can } from '@/lib/permissions'
import { CUSTOMER_STATUS, INVOICE_STATUS, PAYMENT_METHOD } from '@/lib/labels'
import { ledger } from '@/lib/accounting'
import { monthRange } from '@/lib/finance-period'

export const dynamic = 'force-dynamic'

/** Escapa un valor para CSV y neutraliza fórmulas (=, +, -, @) al abrirlo en Excel. */
function cell(value: unknown) {
  let s = value == null ? '' : value instanceof Date ? value.toISOString().slice(0, 10) : String(value)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function csv(headers: string[], rows: unknown[][]) {
  // BOM para que Excel reconozca UTF-8 (tildes y ñ).
  return '﻿' + [headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n')
}

export async function GET(request: Request) {
  const session = await auth()
  const user = session?.user?.id
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { tenantId: true, role: true, isActive: true, tenant: { select: { timezone: true } } },
      })
    : null
  const url = new URL(request.url)
  const type = url.searchParams.get('type')
  // El libro de movimientos es contabilidad; los planes, su módulo; el resto, reportes.
  const area = type === 'ledger' ? 'accounting' : type === 'plans' ? 'plans' : 'reports'
  if (!user?.isActive || !can(user.role, area)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const tenantId = user.tenantId
  let content: string

  if (type === 'invoices') {
    const rows = await prisma.invoice.findMany({
      where: { tenantId },
      orderBy: { issueDate: 'desc' },
      include: { customer: { select: { cedula: true, firstName: true, lastName: true } } },
    })
    content = csv(
      ['Número', 'Emisión', 'Vencimiento', 'Cédula', 'Cliente', 'Concepto', 'Monto', 'Estado', 'Fecha de pago'],
      rows.map((r) => [
        r.number, r.issueDate, r.dueDate, r.customer.cedula, `${r.customer.firstName} ${r.customer.lastName}`,
        r.description, r.amount.toFixed(2), INVOICE_STATUS[r.status], r.paidDate,
      ])
    )
  } else if (type === 'payments') {
    const rows = await prisma.payment.findMany({
      where: { tenantId },
      orderBy: { paidDate: 'desc' },
      include: { customer: { select: { cedula: true, firstName: true, lastName: true } }, invoice: { select: { number: true } } },
    })
    content = csv(
      ['Fecha', 'Cédula', 'Cliente', 'Factura', 'Monto', 'Método', 'Referencia', 'Estado'],
      rows.map((r) => [
        r.paidDate, r.customer.cedula, `${r.customer.firstName} ${r.customer.lastName}`, r.invoice?.number,
        r.amount.toFixed(2), PAYMENT_METHOD[r.method], r.reference, r.status,
      ])
    )
  } else if (type === 'customers') {
    const rows = await prisma.customer.findMany({ where: { tenantId }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] })
    content = csv(
      ['Cédula', 'Nombres', 'Apellidos', 'Teléfono', 'Correo', 'Ciudad', 'Barrio', 'Dirección', 'Estado', 'Alta'],
      rows.map((r) => [
        r.cedula, r.firstName, r.lastName, r.phone, r.email, r.city, r.neighborhood, r.address,
        CUSTOMER_STATUS[r.status], r.createdAt,
      ])
    )
  } else if (type === 'ledger') {
    const period = monthRange(url.searchParams.get('month') ?? undefined, user.tenant.timezone)
    const rows = await ledger(tenantId, period.start, period.end)
    content = csv(
      ['Fecha', 'Tipo', 'Concepto', 'Detalle', 'Cuenta', 'Ingreso', 'Egreso', 'Saldo'],
      rows.map((r) => [
        r.date, r.kind === 'INGRESO' ? 'Ingreso' : 'Egreso', r.concept, r.detail, r.account,
        r.amount > 0 ? r.amount.toFixed(2) : '', r.amount < 0 ? (-r.amount).toFixed(2) : '', r.balance.toFixed(2),
      ])
    )
  } else if (type === 'plans') {
    const kind = url.searchParams.get('tipo') === 'pppoe' ? 'PPPOE' : 'SIMPLE_QUEUE'
    const plans = await prisma.plan.findMany({ where: { tenantId, kind }, orderBy: { name: 'asc' } })
    const counts = await prisma.service.groupBy({
      by: ['planId'],
      where: { tenantId, isActive: true, planId: { in: plans.map((p) => p.id) }, customer: { status: { in: ['ACTIVE', 'SUSPENDED'] } } },
      _count: true,
    })
    const suspended = await prisma.service.groupBy({
      by: ['planId'],
      where: { tenantId, isActive: true, planId: { in: plans.map((p) => p.id) }, customer: { status: 'SUSPENDED' } },
      _count: true,
    })
    const n = (rows: typeof counts, id: string) => rows.find((r) => r.planId === id)?._count ?? 0
    content = csv(
      kind === 'PPPOE'
        ? ['Nombre', 'Tipo', 'Perfil PPP', 'Descarga (Mbps)', 'Subida (Mbps)', 'Precio', 'Activos', 'Suspendidos', 'Estado']
        : ['Nombre', 'Tipo', 'Descarga (Mbps)', 'Subida (Mbps)', 'Precio', 'Burst', 'Prioridad subida', 'Prioridad bajada', 'Activos', 'Suspendidos', 'Estado'],
      plans.map((p) => {
        const cat = p.category === 'CORPORATE' ? 'Corporativo' : 'Residencial'
        const active = n(counts, p.id) - n(suspended, p.id)
        const state = p.isActive ? 'Activo' : 'Inactivo'
        return kind === 'PPPOE'
          ? [p.name, cat, p.pppProfile, p.download, p.upload, p.price.toFixed(2), active, n(suspended, p.id), state]
          : [p.name, cat, p.download, p.upload, p.price.toFixed(2), p.burst, p.priorityUp, p.priorityDown, active, n(suspended, p.id), state]
      })
    )
  } else {
    return NextResponse.json({ error: 'Tipo de exportación no válido' }, { status: 400 })
  }

  const date = new Date().toISOString().slice(0, 10)
  return new NextResponse(content, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${type}-${date}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
