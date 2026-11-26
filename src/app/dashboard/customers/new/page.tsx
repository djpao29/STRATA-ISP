import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { createCustomer } from '../actions'
import { NewCustomerForm } from './new-customer-form'

export const metadata = { title: 'Nuevo cliente' }

export default async function NewCustomerPage() {
  const user = await requireUser('customersWrite')
  const tenantId = user.tenantId
  const [zones, routers, plans, onus, olts, models] = await Promise.all([
    prisma.zone.findMany({ where: { tenantId, isActive: true }, orderBy: { invoiceDay: 'asc' } }),
    prisma.router.findMany({ where: { tenantId }, orderBy: { name: 'asc' }, select: { id: true, name: true, host: true, type: true } }),
    prisma.plan.findMany({ where: { tenantId, isActive: true }, orderBy: [{ kind: 'asc' }, { name: 'asc' }] }),
    prisma.oNU.findMany({ where: { customerId: null, olt: { tenantId } }, include: { olt: { select: { name: true } } }, orderBy: { serial: 'asc' } }),
    prisma.oLT.findMany({ where: { tenantId }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.customerDevice.findMany({ where: { tenantId, model: { not: null } }, distinct: ['model'], select: { model: true }, take: 200 }),
  ])

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 md:text-3xl">Nuevo Cliente</h1>
      <div className="rounded-lg border bg-white p-4 shadow-sm sm:p-6">
        <NewCustomerForm
          action={createCustomer}
          currency={user.tenant.currency}
          zones={zones.map((z) => ({ value: z.id, label: `${z.name} (factura día ${z.invoiceDay}, corte día ${z.suspendDay})` }))}
          routers={routers.filter((r) => r.type === 'MIKROTIK').map((r) => ({ value: r.id, label: `${r.name} (${r.host})` }))}
          plans={plans.map((p) => ({ id: p.id, name: p.name, kind: p.kind, price: Number(p.price), download: p.download, upload: p.upload, pppProfile: p.pppProfile }))}
          onus={onus.map((o) => ({ value: o.id, label: `${o.serial} · ${o.olt.name} ${o.slot}/${o.port}${o.name ? ` · ${o.name}` : ''}` }))}
          olts={olts.map((o) => ({ value: o.id, label: o.name }))}
          deviceModels={models.map((m) => m.model!).filter(Boolean)}
        />
      </div>
    </div>
  )
}
