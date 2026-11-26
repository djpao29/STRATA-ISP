import Link from 'next/link'
import { PageHeader } from '@/components/app/page-header'
import { ActionButton } from '@/components/forms/action-form'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { formatDateTime } from '@/lib/format'
import { deleteOnu, retryAuthorize } from '../../actions'
import { AUTH_LABEL } from '../../shared'

export const metadata = { title: 'ONUs pendientes' }

export default async function PendingPage() {
  const user = await requireUser('olt')
  const onus = await prisma.oNU.findMany({
    where: { olt: { tenantId: user.tenantId }, authState: { in: ['PREAUTHORIZED', 'PENDING', 'FAILED'] } },
    orderBy: { createdAt: 'desc' },
    include: { olt: { select: { id: true, name: true } }, customer: { select: { id: true, firstName: true, lastName: true } } },
  })
  const detected = await prisma.onuDiscovery.findMany({ where: { active: true, serial: { in: onus.map((o) => o.serial) } }, select: { serial: true, oltId: true } })

  return (
    <div className="space-y-4">
      <PageHeader title="Pendientes" description="Pre-autorizadas que la OLT aún no detecta y autorizaciones que fallaron.">
        <Link href="/dashboard/olt/onus/preauthorize" className="rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50">
          Pre-autorizar ONU
        </Link>
      </PageHeader>
      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2">Serial</th>
              <th>OLT</th>
              <th>Cliente</th>
              <th>Estado</th>
              <th>Registrada</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y">
            {onus.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-muted-foreground">
                  Nada pendiente.
                </td>
              </tr>
            ) : (
              onus.map((o) => {
                const seen = detected.some((d) => d.serial === o.serial)
                return (
                  <tr key={o.id}>
                    <td className="px-3 py-2 font-mono text-xs font-semibold">{o.serial}</td>
                    <td>{o.olt.name}</td>
                    <td>
                      {o.customer ? (
                        <Link href={`/dashboard/customers/${o.customer.id}`} className="text-blue-700 hover:underline">
                          {o.customer.firstName} {o.customer.lastName}
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">{o.name ?? '—'}</span>
                      )}
                    </td>
                    <td className="text-xs">
                      <span className={o.authState === 'FAILED' ? 'font-semibold text-red-700' : 'text-amber-700'}>{AUTH_LABEL[o.authState]}</span>
                      {o.authState === 'PREAUTHORIZED' && <div className="text-muted-foreground">{seen ? 'Detectada: se autoriza en la próxima lectura' : 'Esperando que la OLT la detecte'}</div>}
                      {o.authError && <div className="max-w-md text-red-700">{o.authError}</div>}
                    </td>
                    <td className="whitespace-nowrap text-xs">{formatDateTime(o.createdAt, user.tenant.timezone)}</td>
                    <td className="whitespace-nowrap px-2">
                      <div className="flex justify-end gap-1">
                        {seen && (
                          <ActionButton action={retryAuthorize} fields={{ id: o.id }} size="sm">
                            Autorizar ahora
                          </ActionButton>
                        )}
                        <ActionButton action={deleteOnu} fields={{ id: o.id }} variant="ghost" size="sm" className="text-red-600" confirm="¿Cancelar esta pre-autorización?">
                          Cancelar
                        </ActionButton>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
