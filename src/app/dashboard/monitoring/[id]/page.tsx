import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { can } from '@/lib/permissions'
import { getMonitoringSettings } from '@/lib/monitoring/settings'
import { RouterMonitor } from './router-monitor'

export default async function RouterMonitorPage({ params }: { params: { id: string } }) {
  const user = await requireUser('monitoring')
  const router = await prisma.router.findFirst({
    where: { id: params.id, tenantId: user.tenantId },
    select: { id: true, name: true, type: true },
  })
  if (!router) notFound()
  const settings = await getMonitoringSettings(user.tenantId)

  return (
    <RouterMonitor
      routerId={router.id}
      routerName={router.name}
      isMikrotik={router.type === 'MIKROTIK'}
      timeZone={user.tenant.timezone}
      liveRefreshSec={settings.liveRefreshSec}
      canEditRouter={can(user.role, 'routers')}
      thresholds={{ cpu: settings.cpuThreshold, mem: settings.memThreshold }}
    />
  )
}
