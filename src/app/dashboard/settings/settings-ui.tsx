import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import type { ComponentType } from 'react'

type IconLike = ComponentType<{ className?: string; size?: number | string }>

/** Encabezado de una sección de Configuración: icono, título y línea. */
export function SettingsSection({ title, icon: Icon, children }: { title: string; icon: IconLike; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 border-b border-gray-200 pb-2 text-base font-bold text-gray-900">
        <span className="text-indigo-600 [--wx-fill:#4F46E5] [--wx-line:#4F46E5]">
          <Icon size={20} className="h-5 w-5" />
        </span>
        {title}
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7">{children}</div>
    </section>
  )
}

/** Tarjeta que lleva a una parte de la configuración. */
export function SettingsTile({ href, label, icon: Icon }: { href: string; label: string; icon: IconLike }) {
  return (
    <Link
      href={href}
      className="group flex min-h-[104px] flex-col items-center justify-center gap-2.5 rounded-lg border border-gray-200 bg-white px-3 py-4 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 transition group-hover:bg-indigo-600 group-hover:text-white [--wx-fill:#4F46E5] [--wx-line:#4F46E5] group-hover:[--wx-fill:#FFFFFF] group-hover:[--wx-line:#FFFFFF]">
        <Icon size={20} className="h-5 w-5" />
      </span>
      <span className="text-sm font-medium leading-tight text-gray-800">{label}</span>
    </Link>
  )
}

/** Enlace para volver al inicio de Configuración. */
export function BackToSettings() {
  return (
    <Link href="/dashboard/settings" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-gray-900">
      <ChevronLeft className="h-4 w-4" />
      Configuración
    </Link>
  )
}
