import { Building2, DownloadCloud, History, MessagesSquare, Server as ServerSection, ShieldCheck as Shield, UserCircle, UserCog } from 'lucide-react'
import { PageHeader } from '@/components/app/page-header'
import {
  BellIcon,
  ChatIcon,
  CreditCardIcon,
  GaugeIcon,
  InvoiceIcon,
  MonitorAlertIcon,
  MonitoringIcon,
  OltIcon,
  PackageIcon,
  RouterIcon,
  ScissorsIcon,
  SwitchIcon,
  TagIcon,
  ZoneIcon,
} from '@/components/icons/src'
import { requireUser } from '@/lib/session'
import { can, type Module } from '@/lib/permissions'
import { SettingsSection, SettingsTile } from './settings-ui'

export const metadata = { title: 'Configuración' }

type Tile = { label: string; href: string; icon: React.ComponentProps<typeof SettingsTile>['icon']; module: Module }

/** Cada tarjeta lleva a una pantalla que ya existe; se muestran solo las que el rol puede abrir. */
const SECTIONS: Array<{ title: string; icon: Tile['icon']; tiles: Tile[] }> = [
  {
    title: 'Empresa y Facturación',
    icon: Building2,
    tiles: [
      { label: 'Empresa', href: '/dashboard/settings/company', icon: Building2, module: 'settings' },
      { label: 'Gestión de Personal', href: '/dashboard/settings/users', icon: UserCog, module: 'settings' },
      { label: 'Facturación', href: '/dashboard/billing', icon: InvoiceIcon, module: 'billing' },
      { label: 'Formas de Pago', href: '/dashboard/finance/accounts', icon: CreditCardIcon, module: 'paymentAccounts' },
      { label: 'Categorías de Gastos', href: '/dashboard/finance/expense-categories', icon: TagIcon, module: 'expenses' },
      { label: 'Cortes Automáticos', href: '/dashboard/zones/log', icon: ScissorsIcon, module: 'zones' },
    ],
  },
  {
    title: 'Red y Servicios',
    icon: SwitchIcon,
    tiles: [
      { label: 'Zonas', href: '/dashboard/zones', icon: ZoneIcon, module: 'zones' },
      { label: 'Planes', href: '/dashboard/plans', icon: PackageIcon, module: 'plans' },
      { label: 'Routers', href: '/dashboard/routers', icon: RouterIcon, module: 'routers' },
      { label: 'OLT', href: '/dashboard/olt/list', icon: OltIcon, module: 'olt' },
      { label: 'Planes de Velocidad OLT', href: '/dashboard/olt/speed-plans', icon: GaugeIcon, module: 'olt' },
      { label: 'VPN WireGuard', href: '/dashboard/routers#wireguard', icon: Shield, module: 'routers' },
      { label: 'Importar desde MikroTik', href: '/dashboard/settings/import', icon: DownloadCloud, module: 'settings' },
    ],
  },
  {
    title: 'Comunicación',
    icon: MessagesSquare,
    tiles: [
      { label: 'WhatsApp', href: '/dashboard/whatsapp', icon: ChatIcon, module: 'whatsapp' },
      { label: 'Notificaciones Push', href: '/dashboard/customers/notifications', icon: BellIcon, module: 'notifications' },
      { label: 'Avisos en Pantalla', href: '/dashboard/customers/notices', icon: MonitorAlertIcon, module: 'notices' },
    ],
  },
  {
    title: 'Sistema',
    icon: ServerSection,
    tiles: [
      { label: 'Monitoreo', href: '/dashboard/monitoring/settings', icon: MonitoringIcon, module: 'monitoringSettings' },
      { label: 'Log de Actividad', href: '/dashboard/settings/activity', icon: History, module: 'settings' },
      { label: 'Mi Perfil', href: '/dashboard/profile', icon: UserCircle, module: 'dashboard' },
    ],
  },
]

export default async function SettingsPage() {
  const me = await requireUser('settings')
  const sections = SECTIONS.map((s) => ({ ...s, tiles: s.tiles.filter((t) => can(me.role, t.module)) })).filter((s) => s.tiles.length)

  return (
    <div className="space-y-8">
      <PageHeader title="Configuración" />
      {sections.map((s) => (
        <SettingsSection key={s.title} title={s.title} icon={s.icon}>
          {s.tiles.map((t) => (
            <SettingsTile key={t.href} href={t.href} label={t.label} icon={t.icon} />
          ))}
        </SettingsSection>
      ))}
    </div>
  )
}
