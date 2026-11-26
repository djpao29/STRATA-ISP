import { prisma } from '@/lib/prisma'
import { AUTH_TEMPLATES } from '@/lib/olt/drivers'
import { CONSOLE_DEFAULTS } from '@/lib/olt/console'

/** Listas para los formularios de ONU. */
export async function onuOptions(tenantId: string) {
  const [customers, models, plans, naps, olts] = await Promise.all([
    prisma.customer.findMany({
      where: { tenantId, status: { not: 'CANCELLED' } },
      select: { id: true, firstName: true, lastName: true, code: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    }),
    prisma.onuModel.findMany({ where: { tenantId }, orderBy: { name: 'asc' } }),
    prisma.oltSpeedPlan.findMany({ where: { tenantId }, orderBy: { name: 'asc' } }),
    prisma.napBox.findMany({ where: { tenantId }, orderBy: { name: 'asc' }, include: { _count: { select: { onus: true } } } }),
    prisma.oLT.findMany({ where: { tenantId }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ])
  return {
    customers: customers.map((c) => ({ value: c.id, label: `${c.lastName}, ${c.firstName}${c.code ? ` · C-${String(c.code).padStart(6, '0')}` : ''}` })),
    models: models.map((m) => ({ value: m.id, label: `${m.name}${m.oltType ? ` (${m.oltType})` : ''}` })),
    plans: plans.map((p) => ({ value: p.id, label: `${p.name} · ${p.download}/${p.upload} Mbps${p.vlan ? ` · VLAN ${p.vlan}` : ''}` })),
    naps: naps.map((n) => ({ value: n.id, label: `${n.name} (${n._count.onus}/${n.capacity})` })),
    olts: olts.map((o) => ({ value: o.id, label: o.name })),
  }
}

/** Plantillas por defecto de cada marca (autorizar y leer por consola), para mostrarlas en el formulario. */
export const templates = {
  auth: AUTH_TEMPLATES as Record<string, string>,
  read: Object.fromEntries(Object.entries(CONSOLE_DEFAULTS).map(([k, v]) => [k, v!.read])),
  autofind: Object.fromEntries(Object.entries(CONSOLE_DEFAULTS).map(([k, v]) => [k, v!.autofind])),
}
