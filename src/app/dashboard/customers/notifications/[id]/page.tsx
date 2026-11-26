import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { RecipientStatus } from '@prisma/client'
import { PageHeader } from '@/components/app/page-header'
import { DataTable } from '@/components/app/data-table'
import { ActionButton } from '@/components/forms/action-form'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { cancelCampaign, retryFailed } from '../actions'
import { CAMPAIGN_STATUS_LABEL, RECIPIENT_STATUS_LABEL } from '../status'

export const metadata = { title: 'Campaña de WhatsApp' }
export const dynamic = 'force-dynamic'

const FILTERS: Array<{ key: RecipientStatus | 'all'; label: string }> = [
  { key: 'all', label: 'Todos' },
  { key: 'SENT', label: 'Enviados' },
  { key: 'FAILED', label: 'Fallidos' },
  { key: 'PENDING', label: 'En cola' },
  { key: 'SKIPPED', label: 'Omitidos' },
]

export default async function CampaignPage({ params, searchParams }: { params: { id: string }; searchParams: { status?: string } }) {
  const user = await requireUser('notifications')
  const campaign = await prisma.notificationCampaign.findFirst({
    where: { id: params.id, tenantId: user.tenantId },
    include: { createdBy: { select: { name: true } } },
  })
  if (!campaign) notFound()

  const filter = FILTERS.find((f) => f.key === searchParams.status)?.key ?? 'all'
  const [recipients, counts] = await Promise.all([
    prisma.notificationRecipient.findMany({
      where: { campaignId: campaign.id, ...(filter !== 'all' ? { status: filter } : {}) },
      include: { customer: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: [{ status: 'asc' }, { customer: { lastName: 'asc' } }],
      take: 1000,
    }),
    prisma.notificationRecipient.groupBy({ by: ['status'], where: { campaignId: campaign.id }, _count: true }),
  ])
  const count = (s: RecipientStatus) => counts.find((c) => c.status === s)?._count ?? 0
  const tz = user.tenant.timezone
  const [label, cls] = CAMPAIGN_STATUS_LABEL[campaign.status]
  const params0 = Array.isArray(campaign.params) ? (campaign.params as string[]) : []

  return (
    <div className="space-y-6">
      <PageHeader
        title={campaign.name}
        description={`${campaign.audience} · plantilla ${campaign.template} (${campaign.language}) · ${formatDateTime(campaign.createdAt, tz)}${campaign.createdBy ? ` · ${campaign.createdBy.name}` : ''}`}
      >
        <span className={cn('rounded-full px-2.5 py-1 text-xs font-medium', cls)}>{label}</span>
        {count('FAILED') > 0 && (
          <ActionButton action={retryFailed} fields={{ id: campaign.id }} variant="outline">
            Reintentar fallidos ({count('FAILED')})
          </ActionButton>
        )}
        {campaign.status === 'SENDING' && (
          <ActionButton action={cancelCampaign} fields={{ id: campaign.id }} variant="outline" confirm="¿Cancelar los mensajes que faltan por enviar?">
            Cancelar
          </ActionButton>
        )}
        <Link href="/dashboard/customers/notifications" className="text-sm text-blue-700 hover:underline">
          Volver
        </Link>
      </PageHeader>

      {params0.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Parámetros: {params0.map((p, i) => <code key={i} className="mr-2 rounded bg-gray-100 px-1">{`{{${i + 1}}}`} = {p}</code>)}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === 'all' ? '?' : `?status=${f.key}`}
            className={cn('rounded-full border px-3 py-1 text-sm', filter === f.key ? 'border-blue-600 bg-blue-50 text-blue-800' : 'hover:bg-gray-50')}
          >
            {f.label} ({f.key === 'all' ? counts.reduce((s, c) => s + c._count, 0) : count(f.key)})
          </Link>
        ))}
      </div>

      <DataTable title="Destinatarios" headers={['Cliente', 'Teléfono', 'Estado', 'Enviado', 'Intentos', 'Detalle']} rowCount={recipients.length} emptyText="Sin destinatarios con ese filtro.">
        {recipients.map((r) => {
          const [l, c] = RECIPIENT_STATUS_LABEL[r.status]
          return (
            <tr key={r.id}>
              <td>
                <Link href={`/dashboard/customers/${r.customer.id}`} className="font-medium text-blue-700 hover:underline">
                  {r.customer.firstName} {r.customer.lastName}
                </Link>
              </td>
              <td className="font-mono text-xs">{r.phone}</td>
              <td>
                <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', c)}>{l}</span>
              </td>
              <td className="whitespace-nowrap">{r.sentAt ? formatDateTime(r.sentAt, tz) : '—'}</td>
              <td>{r.attempts}</td>
              <td className="max-w-md text-xs">{r.error ? <span className="text-red-700">{r.error}</span> : (r.params as string[]).join(' · ')}</td>
            </tr>
          )
        })}
      </DataTable>
    </div>
  )
}
