'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import type { UserRole } from '@prisma/client'
import {
  Activity,
  Bell,
  ClipboardCheck,
  MapPinned,
  MonitorPlay,
  Router,
  BarChart3,
  BookOpenCheck,
  ChevronDown,
  ClipboardList,
  CreditCard,
  DollarSign,
  FileImage,
  FileText,
  HeartHandshake,
  LayoutDashboard,
  LayoutGrid,
  Map,
  MapPin,
  MessageCircle,
  Package,
  Receipt,
  Scissors,
  Settings,
  Tags,
  Ticket,
  Users,
  Wallet,
  Landmark,
  Wifi,
  Wrench,
  ScrollText,
  PieChart,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { can, ROLE_LABELS, type Module } from '@/lib/permissions'

type Leaf = { title: string; href: string; icon: LucideIcon; module: Module; exact?: boolean; exclude?: string[] }
type Group = { title: string; icon: LucideIcon; children: Array<Leaf | Group> }
type Item = Leaf | Group

const isGroup = (i: Item): i is Group => 'children' in i

const menu: Item[] = [
  { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, module: 'dashboard', exact: true },
  {
    title: 'Clientes',
    icon: Users,
    children: [
      {
        title: 'Lista de clientes',
        href: '/dashboard/customers',
        icon: Users,
        module: 'customers',
        exclude: [
          '/dashboard/customers/notifications',
          '/dashboard/customers/traffic',
          '/dashboard/customers/installations',
          '/dashboard/customers/map',
          '/dashboard/customers/collection-map',
          '/dashboard/customers/devices',
          '/dashboard/customers/notices',
        ],
      },
      { title: 'Notificaciones push', href: '/dashboard/customers/notifications', icon: Bell, module: 'notifications' },
      { title: 'Tráfico', href: '/dashboard/customers/traffic', icon: Activity, module: 'monitoring' },
      { title: 'Instalaciones', href: '/dashboard/customers/installations', icon: ClipboardCheck, module: 'installations' },
      { title: 'Mapa', href: '/dashboard/customers/map', icon: MapPin, module: 'customers' },
      { title: 'Mapa cobro', href: '/dashboard/customers/collection-map', icon: MapPinned, module: 'finance' },
      { title: 'Wifi Router', href: '/dashboard/customers/devices', icon: Router, module: 'devices' },
      { title: 'Avisos en pantalla', href: '/dashboard/customers/notices', icon: MonitorPlay, module: 'notices' },
    ],
  },
  { title: 'Planes', href: '/dashboard/plans', icon: Package, module: 'plans' },
  { title: 'Zonas', href: '/dashboard/zones', icon: MapPin, module: 'zones', exclude: ['/dashboard/zones/log'] },
  {
    title: 'Finanzas',
    icon: Wallet,
    children: [
      { title: 'Pagos Pendientes', href: '/dashboard/finance/pending', icon: DollarSign, module: 'finance' },
      { title: 'Facturas', href: '/dashboard/billing', icon: FileText, module: 'billing' },
      { title: 'Transacciones', href: '/dashboard/payments', icon: Receipt, module: 'payments' },
      { title: 'Estadísticas', href: '/dashboard/reports', icon: BarChart3, module: 'reports' },
      { title: 'Proformas', href: '/dashboard/finance/proformas', icon: ScrollText, module: 'finance' },
      { title: 'Reporte de pagos', href: '/dashboard/finance/payment-reports', icon: ClipboardList, module: 'payments' },
      { title: 'Comprobantes de pago', href: '/dashboard/finance/receipts', icon: FileImage, module: 'payments' },
      { title: 'Promesas de Pago', href: '/dashboard/finance/promises', icon: HeartHandshake, module: 'finance' },
      { title: 'Formas de Pago', href: '/dashboard/finance/accounts', icon: CreditCard, module: 'paymentAccounts' },
      { title: 'Cortes Automáticos', href: '/dashboard/zones/log', icon: Scissors, module: 'zones' },
      { title: 'Gastos', href: '/dashboard/finance/expenses', icon: Landmark, module: 'expenses' },
      {
        title: 'Contabilidad',
        icon: BookOpenCheck,
        children: [
          { title: 'Resumen', href: '/dashboard/finance/accounting', icon: PieChart, module: 'accounting', exact: true },
          { title: 'Libro de movimientos', href: '/dashboard/finance/accounting/ledger', icon: BookOpenCheck, module: 'accounting' },
          { title: 'Categorías de gastos', href: '/dashboard/finance/expense-categories', icon: Tags, module: 'expenses' },
        ],
      },
      { title: 'Dashboard de cobros', href: '/dashboard/finance/collections', icon: LayoutGrid, module: 'finance' },
    ],
  },
  { title: 'Red', href: '/dashboard/network', icon: Wifi, module: 'network' },
  { title: 'Monitoreo', href: '/dashboard/monitoring', icon: Activity, module: 'monitoring' },
  { title: 'Routers', href: '/dashboard/routers', icon: Wrench, module: 'routers' },
  { title: 'OLT/FTTH', href: '/dashboard/olt', icon: Map, module: 'olt' },
  { title: 'Soporte', href: '/dashboard/support', icon: Ticket, module: 'support' },
  { title: 'WhatsApp', href: '/dashboard/whatsapp', icon: MessageCircle, module: 'whatsapp' },
  { title: 'Configuración', href: '/dashboard/settings', icon: Settings, module: 'settings' },
]

/** Quita lo que el rol no puede ver (y los grupos que quedan vacíos). */
function visible(items: Item[], role: UserRole): Item[] {
  return items.flatMap<Item>((i) => {
    if (!isGroup(i)) return can(role, i.module) ? [i] : []
    const children = visible(i.children, role)
    return children.length ? [{ ...i, children }] : []
  })
}

function leafActive(l: Leaf, pathname: string) {
  if (l.exclude?.some((e) => pathname === e || pathname.startsWith(`${e}/`))) return false
  return l.exact ? pathname === l.href : pathname === l.href || pathname.startsWith(`${l.href}/`)
}

function groupActive(g: Group, pathname: string): boolean {
  return g.children.some((c) => (isGroup(c) ? groupActive(c, pathname) : leafActive(c, pathname)))
}

function Entry({ item, pathname, depth }: { item: Item; pathname: string; depth: number }) {
  const active = isGroup(item) ? groupActive(item, pathname) : leafActive(item, pathname)
  const [open, setOpen] = useState(active)
  useEffect(() => {
    if (active) setOpen(true)
  }, [active])

  if (!isGroup(item)) {
    return (
      <Link
        href={item.href}
        className={cn('sidebar-item rounded-md', depth > 0 && 'py-2 text-sm', active && 'active')}
      >
        <item.icon className={cn('mr-3 shrink-0', depth > 0 ? 'h-4 w-4' : 'h-5 w-5')} />
        <span className="truncate font-medium">{item.title}</span>
      </Link>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn('sidebar-item w-full rounded-md', depth > 0 && 'py-2 text-sm', active && !open && 'text-blue-700')}
      >
        <item.icon className={cn('mr-3 shrink-0', depth > 0 ? 'h-4 w-4' : 'h-5 w-5')} />
        <span className="flex-1 truncate text-left font-medium">{item.title}</span>
        <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="ml-4 mt-1 space-y-0.5 border-l border-gray-200 pl-2">
          {item.children.map((c) => (
            <Entry key={c.title} item={c} pathname={pathname} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

export function Sidebar({
  user,
  open = false,
}: {
  user: { name: string; email: string; role: UserRole; companyName: string }
  open?: boolean
}) {
  const pathname = usePathname()
  const items = visible(menu, user.role)

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
          {items.map((item) => (
            <Entry key={item.title} item={item} pathname={pathname} depth={0} />
          ))}
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
