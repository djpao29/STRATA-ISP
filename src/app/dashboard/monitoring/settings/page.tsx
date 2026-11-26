import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { requireUser } from '@/lib/session'
import { getMonitoringSettings } from '@/lib/monitoring/settings'
import { saveMonitoringSettings } from '../actions'
import { MonitoringSettingsForm } from './form'

export const metadata = { title: 'Ajustes de monitoreo' }

export default async function MonitoringSettingsPage() {
  const user = await requireUser('monitoringSettings')
  const s = await getMonitoringSettings(user.tenantId)
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Ajustes de monitoreo" description="Intervalos de consulta y límites de las alertas" />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configuración</CardTitle>
        </CardHeader>
        <CardContent>
          <MonitoringSettingsForm action={saveMonitoringSettings} settings={s} />
        </CardContent>
      </Card>
    </div>
  )
}
