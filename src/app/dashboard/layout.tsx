import { requireUser } from '@/lib/session'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar user={{ name: user.name, email: user.email, role: user.role, companyName: user.tenant.name }} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header name={user.name} email={user.email} isAdmin={user.role === 'ADMIN'} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
