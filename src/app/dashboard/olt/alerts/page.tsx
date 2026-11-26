import Link from 'next/link'
import type { PonEventKind } from '@prisma/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { ActionButton } from '@/components/forms/action-form'
import { CheckboxField, FormGrid, TextField } from '@/components/forms/fields'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { formatDateTime } from '@/lib/format'
import { EVENT_LABEL } from '@/lib/olt/labels'
import { getOltSettings } from '@/lib/olt/service'
import { cn } from '@/lib/utils'
import { resolveEvent, saveOltSettings } from '../actions'
import { InlineForm } from '../forms'

export const metadata = { title: 'Alertas OLT' }

type Props = { searchParams: { kind?: string; closed?: string } }

export default async function OltAlertsPage({ searchParams }: Props) {
  const user = await requireUser('olt')
  const settings = await getOltSettings(user.tenantId)
  const kind = (Object.keys(EVENT_LABEL) as PonEventKind[]).find((k) => k === searchParams.kind)
  const closed = searchParams.closed === '1'
  const [events, counts] = await Promise.all([
    prisma.ponEvent.findMany({
      where: { tenantId: user.tenantId, resolvedAt: closed ? { not: null } : null, ...(kind ? { kind } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: { olt: { select: { name: true } }, onu: { select: { customer: { select: { id: true, firstName: true, lastName: true } } } } },
    }),
    prisma.ponEvent.groupBy({ by: ['kind'], where: { tenantId: user.tenantId, resolvedAt: null }, _count: true }),
  ])
  const tz = user.tenant.timezone
  const href = (o: { kind?: string; closed?: string }) => {
    const p = new URLSearchParams()
    const k = 'kind' in o ? o.kind : searchParams.kind
    const c = 'closed' in o ? o.closed : searchParams.closed
    if (k) p.set('kind', k)
    if (c) p.set('closed', c)
    return `?${p}`
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Alertas" description="Eventos de la red PON detectados en cada lectura y los umbrales que los generan." />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Umbrales y lectura</CardTitle>
        </CardHeader>
        <CardContent>
          <InlineForm action={saveOltSettings} submitLabel="Guardar">
            <FormGrid>
              <TextField name="lowSignal" label="Señal baja (dBm)" type="number" step="0.5" min={-40} max={0} defaultValue={settings.lowSignal} />
              <TextField name="criticalSignal" label="Señal crítica (dBm)" type="number" step="0.5" min={-40} max={0} defaultValue={settings.criticalSignal} />
              <TextField name="variationDb" label="Variación de señal que alerta (dB)" type="number" step="0.5" min={0.5} max={20} defaultValue={settings.variationDb} />
              <TextField name="pollMinutes" label="Leer las OLT cada (minutos)" type="number" min={1} max={120} defaultValue={settings.pollMinutes} />
            </FormGrid>
            <CheckboxField name="autoAuthorize" label="Autorizar solas las ONUs pre-autorizadas cuando la OLT las detecte" defaultChecked={settings.autoAuthorize} />
          </InlineForm>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Link href={href({ kind: undefined })} className={cn('rounded-full border px-3 py-1 text-sm', !kind ? 'border-blue-600 bg-blue-50 text-blue-800' : 'bg-white')}>
          Todos ({counts.reduce((s, c) => s + c._count, 0)})
        </Link>
        {(Object.keys(EVENT_LABEL) as PonEventKind[]).map((k) => (
          <Link key={k} href={href({ kind: k })} className={cn('rounded-full border px-3 py-1 text-sm', kind === k ? 'border-blue-600 bg-blue-50 text-blue-800' : 'bg-white')}>
            {EVENT_LABEL[k]} ({counts.find((c) => c.kind === k)?._count ?? 0})
          </Link>
        ))}
        <Link href={href({ closed: closed ? undefined : '1' })} className="ml-auto rounded-full border bg-white px-3 py-1 text-sm">
          {closed ? 'Ver abiertos' : 'Ver cerrados'}
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2">Desde</th>
              <th>Tipo</th>
              <th>OLT</th>
              <th>Detalle</th>
              <th>Cliente</th>
              <th>{closed ? 'Cerrado' : ''}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {events.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-muted-foreground">
                  {closed ? 'Sin eventos cerrados.' : 'Sin eventos abiertos: todo OK.'}
                </td>
              </tr>
            ) : (
              events.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap px-3 py-2 text-xs">{formatDateTime(e.createdAt, tz)}</td>
                  <td className="whitespace-nowrap">{EVENT_LABEL[e.kind]}</td>
                  <td>{e.olt.name}</td>
                  <td className="text-xs">{e.message}</td>
                  <td>
                    {e.onu?.customer ? (
                      <Link href={`/dashboard/customers/${e.onu.customer.id}`} className="text-blue-700 hover:underline">
                        {e.onu.customer.firstName} {e.onu.customer.lastName}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="whitespace-nowrap px-2 text-right text-xs">
                    {e.resolvedAt ? (
                      formatDateTime(e.resolvedAt, tz)
                    ) : (
                      <ActionButton action={resolveEvent} fields={{ id: e.id }} variant="outline" size="sm">
                        Cerrar
                      </ActionButton>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Los eventos se cierran solos cuando la ONU vuelve a la normalidad en la siguiente lectura.</p>
    </div>
  )
}
