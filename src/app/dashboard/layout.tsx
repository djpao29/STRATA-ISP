import { requireUser } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { AppShell } from '@/components/dashboard/app-shell'
import { NoticeBanner } from '@/components/dashboard/notice-banner'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  const now = new Date()
  // Avisos vigentes para el rol del usuario que no haya ocultado. Un fallo aquí no debe tumbar el panel.
  const notices = await prisma.screenNotice
    .findMany({
      where: {
        tenantId: user.tenantId,
        isActive: true,
        startsAt: { lte: now },
        AND: [
          { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
          { OR: [{ roles: { isEmpty: true } }, { roles: { has: user.role } }] },
        ],
        dismissals: { none: { userId: user.id } },
      },
      orderBy: [{ severity: 'desc' }, { startsAt: 'desc' }],
      take: 5,
      select: { id: true, title: true, message: true, severity: true, dismissible: true },
    })
    .catch((e) => {
      console.error('[avisos]', e)
      return []
    })

  return (
    <AppShell user={{ name: user.name, email: user.email, role: user.role, companyName: user.tenant.name }}>
      <NoticeBanner notices={notices} />
      {children}
    </AppShell>
  )
}
