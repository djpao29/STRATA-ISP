import { PageHeader } from '@/components/app/page-header'
import { ActionButton } from '@/components/forms/action-form'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { formatDateTime } from '@/lib/format'
import { authorizeDiscovery, pollNow } from '../../actions'
import { AutoRefresh, DialogButton, OnuLinkFields } from '../../forms'
import { onuOptions } from '../../options'
import { BRAND_LABEL, pon } from '../../shared'

export const metadata = { title: 'ONUs sin autorizar' }
export const dynamic = 'force-dynamic'

export default async function UnauthorizedPage() {
  const user = await requireUser('olt')
  const [list, opts] = await Promise.all([
    prisma.onuDiscovery.findMany({
      where: { olt: { tenantId: user.tenantId }, active: true },
      orderBy: [{ firstSeenAt: 'desc' }],
      include: { olt: { select: { name: true, brand: true, frame: true, cliUsername: true } } },
    }),
    onuOptions(user.tenantId),
  ])
  const preauth = await prisma.oNU.findMany({ where: { olt: { tenantId: user.tenantId }, authState: { in: ['PREAUTHORIZED', 'FAILED', 'PENDING'] }, serial: { in: list.map((l) => l.serial) } }, select: { serial: true, authState: true } })

  return (
    <div className="space-y-4">
      <AutoRefresh seconds={30} />
      <PageHeader title="ONUs sin autorizar" description="ONUs conectadas que la OLT detecta pero todavía no están autorizadas (autofind). Se actualiza con cada lectura.">
        <ActionButton action={pollNow} variant="outline">
          Buscar ahora
        </ActionButton>
      </PageHeader>
      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2">Serial</th>
              <th>OLT</th>
              <th>PON</th>
              <th>Detectada</th>
              <th>Última vez</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y">
            {list.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-muted-foreground">
                  No hay ONUs sin autorizar.
                </td>
              </tr>
            ) : (
              list.map((d) => {
                const p = preauth.find((x) => x.serial === d.serial)
                return (
                  <tr key={d.id}>
                    <td className="px-3 py-2 font-mono text-xs font-semibold">
                      {d.serial}
                      {d.equipment && <div className="font-sans font-normal text-muted-foreground">{d.equipment}</div>}
                      {p && <div className="font-sans text-xs font-normal text-amber-700">Pre-autorizada · se autorizará en la próxima lectura</div>}
                    </td>
                    <td>
                      {d.olt.name} <span className="text-xs text-muted-foreground">({BRAND_LABEL[d.olt.brand]})</span>
                    </td>
                    <td className="font-mono text-xs">{pon(d.olt.frame, d.slot, d.port)}</td>
                    <td className="whitespace-nowrap text-xs">{formatDateTime(d.firstSeenAt, user.tenant.timezone)}</td>
                    <td className="whitespace-nowrap text-xs">{formatDateTime(d.lastSeenAt, user.tenant.timezone)}</td>
                    <td className="px-2 text-right">
                      {d.olt.cliUsername ? (
                        <DialogButton label="Autorizar" title={`Autorizar ${d.serial} en ${d.olt.name} (${pon(d.olt.frame, d.slot, d.port)})`} action={authorizeDiscovery.bind(null, d.id)} submitLabel="Autorizar en la OLT">
                          <OnuLinkFields {...opts} />
                          <p className="text-xs text-muted-foreground">
                            Se ejecutan en la OLT los comandos de autorización de {BRAND_LABEL[d.olt.brand]} con el plan de velocidad elegido (o los perfiles por defecto de la OLT).
                          </p>
                        </DialogButton>
                      ) : (
                        <span className="text-xs text-muted-foreground">Configura la consola de la OLT para autorizar</span>
                      )}
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
