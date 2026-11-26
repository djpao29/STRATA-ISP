import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { ActionButton } from '@/components/forms/action-form'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { formatDateTime } from '@/lib/format'
import { getOltSettings } from '@/lib/olt/service'
import { deleteOlt, pollNow, saveOlt } from '../actions'
import { OltForm } from '../forms'
import { templates } from '../options'
import { BRAND_LABEL, OnuStatus, RxPower, fmtUptime, pon } from '../shared'

export const metadata = { title: 'OLT' }

export default async function OltDetailPage({ params }: { params: { id: string } }) {
  const user = await requireUser('olt')
  const olt = await prisma.oLT.findFirst({ where: { id: params.id, tenantId: user.tenantId } })
  if (!olt) notFound()
  const [onus, discoveries, settings, events] = await Promise.all([
    prisma.oNU.findMany({
      where: { oltId: olt.id },
      orderBy: [{ slot: 'asc' }, { port: 'asc' }, { onuIndex: 'asc' }],
      include: { customer: { select: { id: true, firstName: true, lastName: true } } },
    }),
    prisma.onuDiscovery.count({ where: { oltId: olt.id, active: true } }),
    getOltSettings(user.tenantId),
    prisma.ponEvent.count({ where: { oltId: olt.id, resolvedAt: null } }),
  ])
  const ports = new Map<string, typeof onus>()
  for (const o of onus.filter((x) => x.inOlt || x.authState === 'AUTHORIZED')) {
    const k = pon(olt.frame, o.slot, o.port)
    ports.set(k, [...(ports.get(k) ?? []), o])
  }
  const tz = user.tenant.timezone

  return (
    <div className="space-y-6">
      <PageHeader
        title={olt.name}
        description={`${BRAND_LABEL[olt.brand]}${olt.vendor ? ` ${olt.vendor}` : ''} · ${olt.host} · ${olt.status === 'ONLINE' ? 'en línea' : olt.status === 'OFFLINE' ? 'sin respuesta' : 'sin leer'}${olt.lastPollAt ? ` · leída ${formatDateTime(olt.lastPollAt, tz)}` : ''}`}
      >
        <ActionButton action={pollNow} fields={{ id: olt.id }}>
          Leer ahora
        </ActionButton>
        <ActionButton action={deleteOlt} fields={{ id: olt.id }} variant="ghost" className="text-red-600" confirm="¿Eliminar esta OLT del sistema? (no cambia nada en el equipo)">
          Eliminar
        </ActionButton>
      </PageHeader>

      {olt.lastError && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">Última lectura: {olt.lastError}</p>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ['ONUs en la OLT', onus.filter((o) => o.inOlt).length],
          ['En línea', onus.filter((o) => o.inOlt && o.status === 'ACTIVE').length],
          ['Sin autorizar', discoveries],
          ['Eventos abiertos', events],
          ['Temperatura / encendida', `${olt.temperature != null ? `${olt.temperature} °C` : '—'} · ${fmtUptime(olt.uptimeSec)}`],
        ].map(([l, v]) => (
          <div key={l as string} className="rounded-lg border bg-white p-3">
            <div className="text-xs text-muted-foreground">{l}</div>
            <div className="text-lg font-semibold">{v}</div>
          </div>
        ))}
      </div>

      {[...ports.entries()].map(([port, list]) => (
        <Card key={port}>
          <CardHeader>
            <CardTitle className="text-base">
              PON {port} · {list.filter((o) => o.status === 'ACTIVE').length}/{list.length} en línea
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Serial</th>
                    <th>Cliente / descripción</th>
                    <th>Estado</th>
                    <th>Señal RX</th>
                    <th>Desde</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((o) => (
                    <tr key={o.id}>
                      <td>{o.onuIndex ?? '—'}</td>
                      <td className="font-mono text-xs">{o.serial}</td>
                      <td>
                        {o.customer ? (
                          <Link href={`/dashboard/customers/${o.customer.id}`} className="text-blue-700 hover:underline">
                            {o.customer.firstName} {o.customer.lastName}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">{o.name ?? 'Sin cliente'}</span>
                        )}
                      </td>
                      <td>{o.inOlt ? <OnuStatus status={o.status} /> : <span className="text-xs text-muted-foreground">No aparece en la OLT</span>}</td>
                      <td>
                        <RxPower value={o.rxPower} low={settings.lowSignal} critical={settings.criticalSignal} />
                      </td>
                      <td className="whitespace-nowrap text-xs">{o.statusChangedAt ? formatDateTime(o.statusChangedAt, tz) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}
      {ports.size === 0 && <p className="rounded-md border bg-white py-8 text-center text-sm text-muted-foreground">Sin ONUs leídas todavía. Pulsa «Leer ahora».</p>}

      <Card>
        <CardHeader>
          <CardTitle>Configuración</CardTitle>
        </CardHeader>
        <CardContent>
          <OltForm
            action={saveOlt.bind(null, olt.id)}
            templates={templates}
            submitLabel="Guardar cambios"
            olt={{
              name: olt.name,
              brand: olt.brand,
              vendor: olt.vendor,
              host: olt.host,
              port: olt.port,
              cliProtocol: olt.cliProtocol,
              cliPort: olt.cliPort,
              cliUsername: olt.cliUsername,
              hasCliPassword: !!olt.cliPasswordEnc,
              frame: olt.frame,
              coordinates: olt.coordinates,
              pollEnabled: olt.pollEnabled,
              lineProfile: olt.lineProfile,
              srvProfile: olt.srvProfile,
              defaultVlan: olt.defaultVlan,
              authTemplate: olt.authTemplate,
            }}
          />
        </CardContent>
      </Card>
    </div>
  )
}
