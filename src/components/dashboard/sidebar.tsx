'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import type { UserRole } from '@prisma/client'
import { ChevronDown, Moon, Sun } from 'lucide-react'
import {
  AlertTriangleIcon,
  BanknoteIcon,
  BellIcon,
  BookIcon,
  ChartBarsIcon,
  ChartPieIcon,
  ChatIcon,
  CheckCircleIcon,
  ChipIcon,
  ClipboardCheckIcon,
  ClipboardListIcon,
  ClockIcon,
  CoinClockIcon,
  CollectionMapIcon,
  CreditCardIcon,
  CustomerListIcon,
  CustomersIcon,
  DashboardIcon,
  DocumentEditIcon,
  GaugeIcon,
  HeartPulseIcon,
  InvoiceIcon,
  LedgerIcon,
  MapIcon,
  MapPinIcon,
  MonitorAlertIcon,
  MonitoringIcon,
  NapBoxIcon,
  OltIcon,
  OnuIcon,
  PackageIcon,
  PromiseIcon,
  ReceiptIcon,
  ReportIcon,
  RouterIcon,
  ScissorsIcon,
  ServerIcon,
  SettingsIcon,
  ShieldCheckIcon,
  SwitchIcon,
  TagIcon,
  TicketIcon,
  TrafficIcon,
  TransferIcon,
  TrendUpIcon,
  WalletIcon,
  WifiIcon,
  XCircleIcon,
  ZoneIcon,
  type Icon,
} from '@/components/icons/src'
import { cn } from '@/lib/utils'
import { can, type Module } from '@/lib/permissions'

type Leaf = { title: string; href: string; icon: Icon; module: Module; exact?: boolean; exclude?: string[] }
type Group = { title: string; icon: Icon; children: Array<Leaf | Group> }
type Item = Leaf | Group

const isGroup = (i: Item): i is Group => 'children' in i

const menu: Item[] = [
  { title: 'Dashboard', href: '/dashboard', icon: DashboardIcon, module: 'dashboard', exact: true },
  {
    title: 'Clientes',
    icon: CustomersIcon,
    children: [
      {
        title: 'Lista de clientes',
        href: '/dashboard/customers',
        icon: CustomerListIcon,
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
      { title: 'Notificaciones push', href: '/dashboard/customers/notifications', icon: BellIcon, module: 'notifications' },
      { title: 'Tráfico', href: '/dashboard/customers/traffic', icon: TrafficIcon, module: 'monitoring' },
      { title: 'Instalaciones', href: '/dashboard/customers/installations', icon: ClipboardCheckIcon, module: 'installations' },
      { title: 'Mapa', href: '/dashboard/customers/map', icon: MapPinIcon, module: 'customers' },
      { title: 'Mapa cobro', href: '/dashboard/customers/collection-map', icon: CollectionMapIcon, module: 'finance' },
      { title: 'Wifi Router', href: '/dashboard/customers/devices', icon: RouterIcon, module: 'devices' },
      { title: 'Avisos en pantalla', href: '/dashboard/customers/notices', icon: MonitorAlertIcon, module: 'notices' },
    ],
  },
  { title: 'Planes', href: '/dashboard/plans', icon: PackageIcon, module: 'plans' },
  { title: 'Zonas', href: '/dashboard/zones', icon: ZoneIcon, module: 'zones', exclude: ['/dashboard/zones/log'] },
  {
    title: 'Finanzas',
    icon: WalletIcon,
    children: [
      { title: 'Pagos Pendientes', href: '/dashboard/finance/pending', icon: CoinClockIcon, module: 'finance' },
      { title: 'Facturas', href: '/dashboard/billing', icon: InvoiceIcon, module: 'billing' },
      { title: 'Transacciones', href: '/dashboard/payments', icon: TransferIcon, module: 'payments' },
      { title: 'Estadísticas', href: '/dashboard/reports', icon: ChartBarsIcon, module: 'reports' },
      { title: 'Proformas', href: '/dashboard/finance/proformas', icon: DocumentEditIcon, module: 'finance' },
      { title: 'Reporte de pagos', href: '/dashboard/finance/payment-reports', icon: ClipboardListIcon, module: 'payments' },
      { title: 'Comprobantes de pago', href: '/dashboard/finance/receipts', icon: ReceiptIcon, module: 'payments' },
      { title: 'Promesas de Pago', href: '/dashboard/finance/promises', icon: PromiseIcon, module: 'finance' },
      { title: 'Formas de Pago', href: '/dashboard/finance/accounts', icon: CreditCardIcon, module: 'paymentAccounts' },
      { title: 'Cortes Automáticos', href: '/dashboard/zones/log', icon: ScissorsIcon, module: 'zones' },
      { title: 'Gastos', href: '/dashboard/finance/expenses', icon: BanknoteIcon, module: 'expenses' },
      {
        title: 'Contabilidad',
        icon: BookIcon,
        children: [
          { title: 'Resumen', href: '/dashboard/finance/accounting', icon: ChartPieIcon, module: 'accounting', exact: true },
          { title: 'Libro de movimientos', href: '/dashboard/finance/accounting/ledger', icon: LedgerIcon, module: 'accounting' },
          { title: 'Categorías de gastos', href: '/dashboard/finance/expense-categories', icon: TagIcon, module: 'expenses' },
        ],
      },
      { title: 'Dashboard de cobros', href: '/dashboard/finance/collections', icon: TrendUpIcon, module: 'finance' },
    ],
  },
  { title: 'Red', href: '/dashboard/network', icon: WifiIcon, module: 'network' },
  { title: 'Monitoreo', href: '/dashboard/monitoring', icon: MonitoringIcon, module: 'monitoring' },
  { title: 'Routers', href: '/dashboard/routers', icon: SwitchIcon, module: 'routers' },
  {
    title: 'OLT',
    icon: OltIcon,
    children: [
      { title: 'Dashboard', href: '/dashboard/olt', icon: DashboardIcon, module: 'olt', exact: true },
      { title: 'OLT', href: '/dashboard/olt/list', icon: ServerIcon, module: 'olt' },
      {
        title: 'ONU',
        icon: OnuIcon,
        children: [
          { title: 'Autorizadas', href: '/dashboard/olt/onus', icon: CheckCircleIcon, module: 'olt', exact: true },
          { title: 'Sin Autorizar', href: '/dashboard/olt/onus/unauthorized', icon: XCircleIcon, module: 'olt' },
          { title: 'Pre-autorizar ONU', href: '/dashboard/olt/onus/preauthorize', icon: ShieldCheckIcon, module: 'olt' },
          { title: 'Pendientes', href: '/dashboard/olt/onus/pending', icon: ClockIcon, module: 'olt' },
        ],
      },
      { title: 'Modelo de ONU', href: '/dashboard/olt/models', icon: ChipIcon, module: 'olt' },
      { title: 'Planes de velocidad', href: '/dashboard/olt/speed-plans', icon: GaugeIcon, module: 'olt' },
      { title: 'Cajas NAP', href: '/dashboard/olt/nap', icon: NapBoxIcon, module: 'olt' },
      { title: 'Mapa FTTH', href: '/dashboard/olt/map', icon: MapIcon, module: 'olt' },
      { title: 'Salud de red', href: '/dashboard/olt/health', icon: HeartPulseIcon, module: 'olt' },
      { title: 'Alertas', href: '/dashboard/olt/alerts', icon: AlertTriangleIcon, module: 'olt' },
      { title: 'Reports', href: '/dashboard/olt/reports', icon: ReportIcon, module: 'olt' },
    ],
  },
  { title: 'Soporte', href: '/dashboard/support', icon: TicketIcon, module: 'support' },
  { title: 'WhatsApp', href: '/dashboard/whatsapp', icon: ChatIcon, module: 'whatsapp' },
  { title: 'Configuración', href: '/dashboard/settings', icon: SettingsIcon, module: 'settings' },
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
        aria-current={active ? 'page' : undefined}
        className={cn('sidebar-item rounded-md', depth > 0 && 'py-2 text-sm', active && 'active')}
      >
        <item.icon size={depth > 0 ? 16 : 20} className="mr-3 shrink-0" />
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
        <item.icon size={depth > 0 ? 16 : 20} className="mr-3 shrink-0" />
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
  forceDark = false,
}: {
  user: { name: string; email: string; role: UserRole; companyName: string }
  open?: boolean
  theme?: SidebarTheme
  /** Con el sistema en modo oscuro el menú va siempre oscuro. */
  forceDark?: boolean
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
    <aside data-theme={forceDark ? 'dark' : theme} className={cn('sidebar relative flex shrink-0 flex-col print:hidden', open && 'open')}>
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
        {/* Con el sistema en modo oscuro el menú va siempre oscuro: el botón de menú blanco no aplica. */}
        {!forceDark && (
          <button
            type="button"
            onClick={toggle}
            title={theme === 'dark' ? 'Cambiar a menú blanco' : 'Cambiar a menú oscuro'}
            aria-label={theme === 'dark' ? 'Cambiar a menú blanco' : 'Cambiar a menú oscuro'}
            className="sb-muted rounded-md p-2 transition-colors hover:bg-[var(--sb-hover)] hover:text-[var(--sb-text-strong)]"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        )}
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
