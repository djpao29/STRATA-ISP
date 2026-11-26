import Link from 'next/link'
import type { ONUStatus, Prisma } from '@prisma/client'
import { PageHeader } from '@/components/app/page-header'
import { ActionButton } from '@/components/forms/action-form'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { formatDateTime } from '@/lib/format'
import { getOltSettings } from '@/lib/olt/service'
import { cn } from '@/lib/utils'
import { deleteOnu, updateOnu } from '../actions'
import { DialogButton, OnuLinkFields } from '../forms'
import { onuOptions } from '../options'
import { OnuStatus, RxPower, pon } from '../shared'

export const metadata = { title: 'ONUs autorizadas' }

const FILTERS: Array<{ key: string; label: string; where: Prisma.ONUWhereInput }> = [
  { key: 'all', label: 'Todas', where: {} },
  { key: 'online', label: 'En línea', where: { inOlt: true, status: 'ACTIVE' } },
  { key: 'power', label: 'Sin energía', where: { inOlt: true, status: 'POWER_OFF' } },
  { key: 'down', label: 'Fuera de línea', where: { inOlt: true, status: { in: ['LOS', 'OFFLINE'] as ONUStatus[] } } },
  { key: 'nocustomer', label: 'Sin cliente', where: { customerId: null } },
  { key: 'missing', label: 'No aparecen en la OLT', where: { inOlt: false } },
]

type Props = { searchParams: { f?: string; q?: string; olt?: string; low?: string } }

export default async function OnusPage({ searchParams }: Props) {
  const user = await requireUser('olt')
  const settings = await getOltSettings(user.tenantId)
  const filter = FILTERS.find((f) => f.key === searchParams.f) ?? FILTERS[0]
  const q = searchParams.q?.trim()
  const where: Prisma.ONUWhereInput = {
    olt: { tenantId: user.tenantId },
    authState: 'AUTHORIZED',
    ...filter.where,
    ...(searchParams.olt ? { oltId: searchParams.olt } : {}),
    ...(searchParams.low ? { rxPower: { lte: settings.lowSignal } } : {}),
    ...(q
      ? {
          OR: [
            { serial: { contains: q, mode: 'insensitive' } },
            { name: { contains: q, mode: 'insensitive' } },
            { customer: { OR: [{ firstName: { contains: q, mode: 'insensitive' } }, { lastName: { contains: q, mode: 'insensitive' } }] } },
          ],
        }
      : {}),
  }
  const [onus, total, opts] = await Promise.all([
    prisma.oNU.findMany({
      where,
      orderBy: [{ oltId: 'asc' }, { slot: 'asc' }, { port: 'asc' }, { onuIndex: 'asc' }],
      take: 500,
      include: {
        olt: { select: { name: true, frame: true } },
        customer: { select: { id: true, firstName: true, lastName: true } },
        onuModel: { select: { name: true } },
        speedPlan: { select: { name: true } },
        napBox: { select: { name: true } },
      },
    }),
    prisma.oNU.count({ where }),
    onuOptions(user.tenantId),
  ])
  const qs = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    const all = { f: searchParams.f, q, olt: searchParams.olt, low: searchParams.low, ...over }
    Object.entries(all).forEach(([k, v]) => v && p.set(k, v))
    return `?${p}`
  }

  return (
    <div className="space-y-4">
      <PageHeader title="ONUs autorizadas" description={`${total} ONU(s) autorizadas${searchParams.low ? ` con señal ≤ ${settings.lowSignal} dBm` : ''}`}>
        <a href="/api/export?type=onus" className="rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50">
          Descargar CSV
        </a>
      </PageHeader>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link key={f.key} href={qs({ f: f.key === 'all' ? undefined : f.key })} className={cn('rounded-full border px-3 py-1 text-sm', filter.key === f.key ? 'border-blue-600 bg-blue-50 text-blue-800' : 'bg-white hover:bg-gray-50')}>
            {f.label}
          </Link>
        ))}
        {searchParams.low && (
          <Link href={qs({ low: undefined })} className="rounded-full border border-amber-400 bg-amber-50 px-3 py-1 text-sm text-amber-800">
            Baja señal ✕
          </Link>
        )}
      </div>
      <form className="flex flex-col gap-2 sm:flex-row">
        {searchParams.f && <input type="hidden" name="f" value={searchParams.f} />}
        <input name="q" defaultValue={q} placeholder="Buscar por serial, descripción o cliente" className="h-10 flex-1 rounded-md border px-3 text-sm" />
        <select name="olt" defaultValue={searchParams.olt ?? ''} className="h-10 rounded-md border px-3 text-sm">
          <option value="">Todas las OLT</option>
          {opts.olts.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button className="h-10 rounded-md border bg-white px-4 text-sm hover:bg-gray-50">Filtrar</button>
      </form>

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2">OLT · PON</th>
              <th>Serial</th>
              <th>Cliente</th>
              <th>Estado</th>
              <th>Señal RX</th>
              <th>Modelo / plan</th>
              <th>NAP</th>
              <th>Autorizada</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y">
            {onus.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-muted-foreground">
                  Sin ONUs con ese filtro.
                </td>
              </tr>
            ) : (
              onus.map((o) => (
                <tr key={o.id}>
                  <td className="px-3 py-2 text-xs">
                    {o.olt.name}
                    <div className="font-mono text-muted-foreground">{pon(o.olt.frame, o.slot, o.port, o.onuIndex)}</div>
                  </td>
                  <td className="font-mono text-xs">{o.serial}</td>
                  <td>
                    {o.customer ? (
                      <Link href={`/dashboard/customers/${o.customer.id}`} className="text-blue-700 hover:underline">
                        {o.customer.firstName} {o.customer.lastName}
                      </Link>
                    ) : (
                      <span className="text-xs text-muted-foreground">{o.name ?? 'Sin cliente'}</span>
                    )}
                  </td>
                  <td>{o.inOlt ? <OnuStatus status={o.status} /> : <span className="text-xs text-muted-foreground">No aparece</span>}</td>
                  <td>
                    <RxPower value={o.rxPower} low={settings.lowSignal} critical={settings.criticalSignal} />
                  </td>
                  <td className="text-xs">
                    {o.onuModel?.name ?? '—'}
                    {o.speedPlan && <div className="text-muted-foreground">{o.speedPlan.name}</div>}
                  </td>
                  <td className="text-xs">{o.napBox ? `${o.napBox.name}${o.napPort ? ` · p${o.napPort}` : ''}` : '—'}</td>
                  <td className="whitespace-nowrap text-xs">{o.authorizedAt ? formatDateTime(o.authorizedAt, user.tenant.timezone) : 'Leída de la OLT'}</td>
                  <td className="whitespace-nowrap px-2">
                    <div className="flex gap-1">
                      <DialogButton label="Editar" variant="outline" title={`ONU ${o.serial}`} action={updateOnu.bind(null, o.id)} submitLabel="Guardar">
                        <OnuLinkFields {...opts} values={o} />
                        <p className="text-xs text-muted-foreground">Estos datos son del sistema; no se cambia nada en la OLT.</p>
                      </DialogButton>
                      <ActionButton action={deleteOnu} fields={{ id: o.id }} variant="ghost" size="sm" className="text-red-600" confirm="¿Quitar la ONU del sistema? No se desautoriza en la OLT; si sigue allí, volverá a aparecer en la próxima lectura.">
                        Quitar
                      </ActionButton>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {total > onus.length && <p className="text-xs text-muted-foreground">Mostrando {onus.length} de {total}. Usa los filtros o descarga el CSV.</p>}
    </div>
  )
}
