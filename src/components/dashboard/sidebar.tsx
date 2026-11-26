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
  Radio,
  Server,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  Clock,
  Cpu,
  Gauge,
  Box,
  HeartPulse,
  AlertTriangle,
  FileBarChart,
  Sun,
  Moon,
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
  {
    title: 'OLT',
    icon: Radio,
    children: [
      { title: 'Dashboard', href: '/dashboard/olt', icon: Radio, module: 'olt', exact: true },
      { title: 'OLT', href: '/dashboard/olt/list', icon: Server, module: 'olt' },
      {
        title: 'ONU',
        icon: Cpu,
        children: [
          { title: 'Autorizadas', href: '/dashboard/olt/onus', icon: CheckCircle2, module: 'olt', exact: true },
          { title: 'Sin Autorizar', href: '/dashboard/olt/onus/unauthorized', icon: XCircle, module: 'olt' },
          { title: 'Pre-autorizar ONU', href: '/dashboard/olt/onus/preauthorize', icon: ShieldCheck, module: 'olt' },
          { title: 'Pendientes', href: '/dashboard/olt/onus/pending', icon: Clock, module: 'olt' },
        ],
      },
      { title: 'Modelo de ONU', href: '/dashboard/olt/models', icon: Box, module: 'olt' },
      { title: 'Planes de velocidad', href: '/dashboard/olt/speed-plans', icon: Gauge, module: 'olt' },
      { title: 'Cajas NAP', href: '/dashboard/olt/nap', icon: Package, module: 'olt' },
      { title: 'Mapa FTTH', href: '/dashboard/olt/map', icon: Map, module: 'olt' },
      { title: 'Salud de red', href: '/dashboard/olt/health', icon: HeartPulse, module: 'olt' },
      { title: 'Alertas', href: '/dashboard/olt/alerts', icon: AlertTriangle, module: 'olt' },
      { title: 'Reports', href: '/dashboard/olt/reports', icon: FileBarChart, module: 'olt' },
    ],
  },
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
        className={cn('sidebar-item w-full rounded-md', depth > 0 && 'py-2 text-sm', active && 'group-active')}
      >
        <item.icon className={cn('mr-3 shrink-0', depth > 0 ? 'h-4 w-4' : 'h-5 w-5')} />
        <span className="flex-1 truncate text-left font-medium">{item.title}</span>
        <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="sb-border ml-4 mt-1 space-y-0.5 border-l pl-2">
          {item.children.map((c) => (
            <Entry key={c.title} item={c} pathname={pathname} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

export type SidebarTheme = 'dark' | 'light'

export function Sidebar({
  user,
  open = false,
  theme: initialTheme = 'dark',
}: {
  user: { name: string; email: string; role: UserRole; companyName: string }
  open?: boolean
  theme?: SidebarTheme
}) {
  const pathname = usePathname()
  const items = visible(menu, user.role)
  const [theme, setTheme] = useState<SidebarTheme>(initialTheme)
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    // Se recuerda en este navegador (cookie de un año) y el servidor la lee para pintar sin parpadeo.
    document.cookie = `sb-theme=${next}; path=/; max-age=31536000; samesite=lax`
  }

  return (
    <aside data-theme={theme} className={cn('sidebar relative flex shrink-0 flex-col', open && 'open')}>
      <div className="flex items-center justify-between px-5 pb-3 pt-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600">
            <span className="text-lg font-bold text-white">{user.companyName.charAt(0).toUpperCase()}</span>
          </div>
          <div className="min-w-0">
            <h2 className="sb-strong truncate text-base font-bold">{user.companyName}</h2>
            <p className="sb-muted text-xs">Gestión ISP</p>
          </div>
        </div>
        <button
          type="button"
          onClick={toggle}
          title={theme === 'dark' ? 'Cambiar a menú blanco' : 'Cambiar a menú oscuro'}
          aria-label={theme === 'dark' ? 'Cambiar a menú blanco' : 'Cambiar a menú oscuro'}
          className="sb-muted rounded-md p-2 transition-colors hover:bg-[var(--sb-hover)] hover:text-[var(--sb-text-strong)]"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>

      <div className="px-3 pb-3">
        <div className="sb-card flex items-center gap-3 rounded-lg border px-3 py-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-600 text-sm font-bold text-white">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="sb-strong truncate text-sm font-semibold">{user.name}</p>
            <p className="sb-muted truncate text-xs">{ROLE_LABELS[user.role]}</p>
          </div>
        </div>
      </div>

      <nav className="sb-border flex-1 overflow-y-auto border-t py-3">
        <div className="space-y-1 px-3">
          {items.map((item) => (
            <Entry key={item.title} item={item} pathname={pathname} depth={0} />
          ))}
        </div>
      </nav>

      <div className="sb-border border-t px-4 py-3">
        <p className="sb-muted truncate text-xs">{user.email}</p>
      </div>
    </aside>
  )
}
