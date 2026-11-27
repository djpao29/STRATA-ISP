'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import type { UserRole } from '@prisma/client'
import { Sidebar, type SidebarTheme } from './sidebar'
import { Header } from './header'

export type AppTheme = 'dark' | 'light'

/** Estructura del panel: menú lateral (desplegable en teléfonos), cabecera y contenido. */
export function AppShell({
  user,
  children,
  sidebarTheme = 'dark',
  appTheme: initialAppTheme = 'light',
}: {
  user: { name: string; email: string; role: UserRole; companyName: string }
  children: React.ReactNode
  sidebarTheme?: SidebarTheme
  /** Tema de todo el sistema (cookie "theme"). */
  appTheme?: AppTheme
}) {
  const [open, setOpen] = useState(false)
  const [appTheme, setAppTheme] = useState<AppTheme>(initialAppTheme)
  const toggleTheme = () => {
    const next = appTheme === 'dark' ? 'light' : 'dark'
    setAppTheme(next)
    const html = document.documentElement
    html.classList.toggle('dark', next === 'dark')
    html.dataset.theme = next
    // Se recuerda en este navegador (un año); el servidor la lee para pintar sin parpadeo.
    document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=lax`
  }
  const pathname = usePathname()
  useEffect(() => setOpen(false), [pathname]) // cerrar el menú al navegar

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-[#0e1626] print:block print:h-auto print:bg-white">
      <Sidebar user={user} open={open} theme={sidebarTheme} forceDark={appTheme === 'dark'} />
      {open && <div className="sidebar-overlay md:hidden" onClick={() => setOpen(false)} aria-hidden />}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden print:block print:overflow-visible">
        <div className="print:hidden">
          <Header name={user.name} email={user.email} isAdmin={user.role === 'ADMIN'} onMenu={() => setOpen((v) => !v)} theme={appTheme} onToggleTheme={toggleTheme} />
        </div>
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 print:overflow-visible print:p-0">{children}</main>
      </div>
    </div>
  )
}
