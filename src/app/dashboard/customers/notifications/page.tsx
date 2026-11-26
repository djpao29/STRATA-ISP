import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { DataTable } from '@/components/app/data-table'
import { ActionButton } from '@/components/forms/action-form'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { can } from '@/lib/permissions'
import { formatDateTime } from '@/lib/format'
import { TEMPLATE_VARIABLES } from '@/lib/notifications'
import { cancelCampaign, sendCampaign } from './actions'
import { CampaignForm } from './forms'
import { CAMPAIGN_STATUS_LABEL } from './status'

export const metadata = { title: 'Notificaciones push' }
export const dynamic = 'force-dynamic'

export default async function NotificationsPage() {
  const user = await requireUser('notifications')
  const [wa, zones, customers, campaigns] = await Promise.all([
    prisma.whatsAppConfig.findUnique({ where: { tenantId: user.tenantId }, select: { isActive: true } }),
    prisma.zone.findMany({ where: { tenantId: user.tenantId, isActive: true }, orderBy: { invoiceDay: 'asc' }, select: { id: true, name: true } }),
    prisma.customer.findMany({
      where: { tenantId: user.tenantId, status: { not: 'CANCELLED' } },
      select: { id: true, firstName: true, lastName: true, phone: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    }),
    prisma.notificationCampaign.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { createdBy: { select: { name: true } } },
    }),
  ])
  const counts = campaigns.length
    ? await prisma.notificationRecipient.groupBy({ by: ['campaignId', 'status'], where: { campaignId: { in: campaigns.map((c) => c.id) } }, _count: true })
    : []
  const countOf = (id: string, status: string) => counts.find((c) => c.campaignId === id && c.status === status)?._count ?? 0
  const ready = !!wa?.isActive

  return (
    <div className="space-y-6">
      <PageHeader title="Notificaciones push" description="Mensajes de WhatsApp a tus clientes con plantillas aprobadas por Meta: recordatorios de pago, avisos de corte, mantenimientos." />

      {!ready && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {wa ? 'La integración de WhatsApp está desactivada.' : 'WhatsApp todavía no está configurado.'}{' '}
          {can(user.role, 'whatsapp') ? (
            <Link href="/dashboard/whatsapp" className="font-medium underline">
              Configurar WhatsApp
            </Link>
          ) : (
            'Pide a un administrador que lo configure.'
          )}{' '}
          Sin eso no se puede enviar.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Nueva campaña</CardTitle>
        </CardHeader>
        <CardContent>
          <CampaignForm
            action={sendCampaign}
            zones={zones.map((z) => ({ value: z.id, label: z.name }))}
            customers={customers.map((c) => ({ value: c.id, label: `${c.lastName}, ${c.firstName}${c.phone ? ` · ${c.phone}` : ' · sin teléfono'}` }))}
            variables={Object.entries(TEMPLATE_VARIABLES).map(([value, label]) => ({ value, label }))}
          />
          <p className="mt-4 text-xs text-muted-foreground">
            WhatsApp solo permite que la empresa inicie conversaciones con plantillas aprobadas. Créalas en WhatsApp Manager con los parámetros {'{{1}}'}, {'{{2}}'}… y
            escribe aquí el valor de cada uno en el mismo orden.
          </p>
        </CardContent>
      </Card>

      <DataTable title="Historial" headers={['Fecha', 'Campaña', 'Destinatarios', 'Enviados', 'Fallidos', 'Omitidos', 'Estado', '']} rowCount={campaigns.length} emptyText="Todavía no se ha enviado ninguna campaña.">
        {campaigns.map((c) => {
          const [label, cls] = CAMPAIGN_STATUS_LABEL[c.status]
          const pendingCount = countOf(c.id, 'PENDING')
          return (
            <tr key={c.id}>
              <td className="whitespace-nowrap">{formatDateTime(c.createdAt, user.tenant.timezone)}</td>
              <td>
                <Link href={`/dashboard/customers/notifications/${c.id}`} className="font-medium text-blue-700 hover:underline">
                  {c.name}
                </Link>
                <div className="text-xs text-muted-foreground">
                  {c.audience} · {c.template}
                  {c.createdBy && ` · ${c.createdBy.name}`}
                </div>
              </td>
              <td>{['PENDING', 'SENT', 'FAILED', 'SKIPPED'].reduce((s, st) => s + countOf(c.id, st), 0)}</td>
              <td className="text-green-700">{countOf(c.id, 'SENT')}</td>
              <td className="text-red-700">{countOf(c.id, 'FAILED')}</td>
              <td className="text-muted-foreground">{countOf(c.id, 'SKIPPED')}</td>
              <td>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
                {c.status === 'SENDING' && pendingCount > 0 && <div className="text-xs text-muted-foreground">{pendingCount} en cola</div>}
              </td>
              <td>
                {c.status === 'SENDING' && (
                  <ActionButton action={cancelCampaign} fields={{ id: c.id }} variant="outline" size="sm" confirm="¿Cancelar los mensajes que faltan por enviar?">
                    Cancelar
                  </ActionButton>
                )}
              </td>
            </tr>
          )
        })}
      </DataTable>
    </div>
  )
}
