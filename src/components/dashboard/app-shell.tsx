'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import type { UserRole } from '@prisma/client'
import { Sidebar, type SidebarTheme } from './sidebar'
import { Header } from './header'

/** Estructura del panel: menú lateral (desplegable en teléfonos), cabecera y contenido. */
export function AppShell({
  user,
  children,
  sidebarTheme = 'dark',
}: {
  user: { name: string; email: string; role: UserRole; companyName: string }
  children: React.ReactNode
  sidebarTheme?: SidebarTheme
}) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  useEffect(() => setOpen(false), [pathname]) // cerrar el menú al navegar

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar user={user} open={open} theme={sidebarTheme} />
      {open && <div className="sidebar-overlay md:hidden" onClick={() => setOpen(false)} aria-hidden />}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header name={user.name} email={user.email} isAdmin={user.role === 'ADMIN'} onMenu={() => setOpen((v) => !v)} />
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6">{children}</main>
      </div>
    </div>
  )
}
