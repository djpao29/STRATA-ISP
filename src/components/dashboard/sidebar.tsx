'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { UserRole } from '@prisma/client'
import {
  Activity,
  BarChart3,
  CreditCard,
  FileText,
  LayoutDashboard,
  Map,
  MessageCircle,
  Package,
  Settings,
  Ticket,
  Users,
  Wifi,
  Wrench,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { can, ROLE_LABELS, type Module } from '@/lib/permissions'

const menuItems: Array<{ title: string; href: string; icon: typeof Users; module: Module }> = [
  { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, module: 'dashboard' },
  { title: 'Clientes', href: '/dashboard/customers', icon: Users, module: 'customers' },
  { title: 'Planes', href: '/dashboard/plans', icon: Package, module: 'plans' },
  { title: 'Facturación', href: '/dashboard/billing', icon: FileText, module: 'billing' },
  { title: 'Pagos', href: '/dashboard/payments', icon: CreditCard, module: 'payments' },
  { title: 'Red', href: '/dashboard/network', icon: Wifi, module: 'network' },
  { title: 'Monitoreo', href: '/dashboard/monitoring', icon: Activity, module: 'monitoring' },
  { title: 'Routers', href: '/dashboard/routers', icon: Wrench, module: 'routers' },
  { title: 'OLT/FTTH', href: '/dashboard/olt', icon: Map, module: 'olt' },
  { title: 'Soporte', href: '/dashboard/support', icon: Ticket, module: 'support' },
  { title: 'WhatsApp', href: '/dashboard/whatsapp', icon: MessageCircle, module: 'whatsapp' },
  { title: 'Reportes', href: '/dashboard/reports', icon: BarChart3, module: 'reports' },
  { title: 'Configuración', href: '/dashboard/settings', icon: Settings, module: 'settings' },
]

export function Sidebar({ user, open = false }: { user: { name: string; email: string; role: UserRole; companyName: string }; open?: boolean }) {
  const pathname = usePathname()

  return (
    <aside className={cn('sidebar relative flex shrink-0 flex-col', open && 'open')}>
      <div className="border-b border-gray-200 p-6">
        <div className="flex items-center space-x-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600">
            <span className="text-lg font-bold text-white">{user.companyName.charAt(0).toUpperCase()}</span>
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-gray-900">{user.companyName}</h2>
            <p className="text-sm text-gray-500">Gestión ISP</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-4">
        <div className="space-y-1 px-4">
          {menuItems
            .filter((item) => can(user.role, item.module))
            .map((item) => {
              const isActive =
                item.href === '/dashboard' ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`)
              return (
                <Link key={item.href} href={item.href} className={cn('sidebar-item rounded-md', isActive && 'active')}>
                  <item.icon className="mr-3 h-5 w-5" />
                  <span className="font-medium">{item.title}</span>
                </Link>
              )
            })}
        </div>
      </nav>

      <div className="border-t border-gray-200 p-4">
        <p className="truncate text-sm font-medium text-gray-900">{user.name}</p>
        <p className="truncate text-xs text-gray-500">
          {ROLE_LABELS[user.role]} · {user.email}
        </p>
      </div>
    </aside>
  )
}
