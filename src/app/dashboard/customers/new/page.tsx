import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { createCustomer } from '../actions'
import { NewCustomerForm } from './new-customer-form'

export const metadata = { title: 'Nuevo cliente' }
export const dynamic = 'force-dynamic'

export default async function NewCustomerPage() {
  const user = await requireUser('customersWrite')
  const tenantId = user.tenantId
  const [zones, routers, plans, freeOnus, discovered, olts, speedPlans, naps, models] = await Promise.all([
    prisma.zone.findMany({ where: { tenantId, isActive: true }, orderBy: { invoiceDay: 'asc' } }),
    prisma.router.findMany({ where: { tenantId }, orderBy: { name: 'asc' }, select: { id: true, name: true, host: true, type: true } }),
    prisma.plan.findMany({ where: { tenantId, isActive: true }, orderBy: [{ kind: 'asc' }, { name: 'asc' }] }),
    // ONUs ya autorizadas en la OLT que no tienen cliente.
    prisma.oNU.findMany({
      where: { customerId: null, authState: 'AUTHORIZED', olt: { tenantId } },
      include: { olt: { select: { name: true, frame: true } } },
      orderBy: [{ oltId: 'asc' }, { slot: 'asc' }, { port: 'asc' }, { onuIndex: 'asc' }],
    }),
    // ONUs conectadas que la OLT detecta sin autorizar.
    prisma.onuDiscovery.findMany({ where: { active: true, olt: { tenantId } }, include: { olt: { select: { name: true, frame: true, cliUsername: true } } }, orderBy: { firstSeenAt: 'desc' } }),
    prisma.oLT.findMany({ where: { tenantId }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.oltSpeedPlan.findMany({ where: { tenantId }, orderBy: { download: 'asc' } }),
    prisma.napBox.findMany({ where: { tenantId }, orderBy: { name: 'asc' }, include: { _count: { select: { onus: true } } } }),
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
          fiber={{
            free: freeOnus.map((o) => ({
              value: `onu:${o.id}`,
              label: `${o.serial} · ${o.olt.name} ${o.olt.frame}/${o.slot}/${o.port}${o.onuIndex != null ? `:${o.onuIndex}` : ''}${o.rxPower != null ? ` · ${o.rxPower} dBm` : ''}`,
            })),
            discovered: discovered.map((d) => ({
              value: `disc:${d.id}`,
              label: `${d.serial} · ${d.olt.name} ${d.olt.frame}/${d.slot}/${d.port}${d.olt.cliUsername ? '' : ' (OLT sin consola: no se puede autorizar)'}`,
              disabled: !d.olt.cliUsername,
            })),
            olts: olts.map((o) => ({ value: o.id, label: o.name })),
            speedPlans: speedPlans.map((p) => ({ value: p.id, label: `${p.name} · ${p.download}/${p.upload} Mbps${p.vlan ? ` · VLAN ${p.vlan}` : ''}` })),
            naps: naps.map((n) => ({ value: n.id, label: `${n.name} (${n._count.onus}/${n.capacity})`, disabled: n._count.onus >= n.capacity })),
          }}
          deviceModels={models.map((m) => m.model!).filter(Boolean)}
        />
      </div>
    </div>
  )
}
