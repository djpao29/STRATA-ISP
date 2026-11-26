import Link from 'next/link'
import { Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/app/page-header'
import { requireUser } from '@/lib/session'
import { can } from '@/lib/permissions'
import { getMonitoringSettings } from '@/lib/monitoring/settings'
import { OverviewClient } from './overview-client'

export const metadata = { title: 'Monitoreo MikroTik' }

export default async function MonitoringPage() {
  const user = await requireUser('monitoring')
  const settings = await getMonitoringSettings(user.tenantId)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Monitoreo MikroTik"
        description={`Estado real de los routers vía API REST de RouterOS 7 · recolección cada ${settings.pollIntervalSec} s`}
      >
        {can(user.role, 'monitoringSettings') && (
          <Button asChild variant="outline">
            <Link href="/dashboard/monitoring/settings">
              <Settings2 className="mr-2 h-4 w-4" />
              Ajustes y alertas
            </Link>
          </Button>
        )}
      </PageHeader>
      <OverviewClient timeZone={user.tenant.timezone} canManage={can(user.role, 'monitoringSettings')} />
    </div>
  )
}
