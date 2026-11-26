import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { StatusBadge } from '@/components/app/status-badge'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { formatDateTime } from '@/lib/format'
import { saveWhatsAppConfig, sendTestMessage } from './actions'
import { TestMessageForm, WhatsAppConfigForm } from './forms'

export const metadata = { title: 'WhatsApp' }

export default async function WhatsAppPage() {
  const user = await requireUser('whatsapp')
  const config = await prisma.whatsAppConfig.findUnique({
    where: { tenantId: user.tenantId },
    select: { phoneNumberId: true, displayPhone: true, isActive: true, updatedAt: true },
  })

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="WhatsApp" description="Conexión con WhatsApp Cloud API (Meta) para enviar mensajes a los clientes">
        <StatusBadge value={config?.isActive ? 'ACTIVE' : 'INACTIVE'} />
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle>Configuración</CardTitle>
          <CardDescription>
            {config ? `Última modificación: ${formatDateTime(config.updatedAt)}` : 'Todavía no está configurado.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WhatsAppConfigForm action={saveWhatsAppConfig} config={config} />
        </CardContent>
      </Card>

      {config && (
        <Card>
          <CardHeader>
            <CardTitle>Probar envío</CardTitle>
            <CardDescription>
              Los mensajes que inicia la empresa deben usar una plantilla aprobada en Meta. La plantilla
              &quot;hello_world&quot; viene aprobada en las cuentas nuevas y sirve para comprobar la conexión.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TestMessageForm action={sendTestMessage} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
