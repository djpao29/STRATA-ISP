'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { LogOut, Menu, Moon, Search, Settings, Sun, User } from 'lucide-react'
import { signOut } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function Header({
  name,
  email,
  isAdmin,
  onMenu,
  theme = 'light',
  onToggleTheme,
}: {
  name: string
  email: string
  isAdmin: boolean
  onMenu?: () => void
  theme?: 'dark' | 'light'
  onToggleTheme?: () => void
}) {
  const router = useRouter()
  const initials = name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <header className="border-b border-gray-200 bg-white px-4 py-3 dark:border-[#1f2a3f] dark:bg-[#0b1220] md:px-6 md:py-4">
      <div className="flex items-center justify-between gap-2 md:gap-4">
        <Button variant="ghost" size="icon" className="shrink-0 md:hidden" onClick={onMenu} aria-label="Abrir menú">
          <Menu className="h-5 w-5" />
        </Button>
        {/* Búsqueda rápida de clientes */}
        <form
          role="search"
          className="relative w-full max-w-md"
          onSubmit={(e) => {
            e.preventDefault()
            const q = new FormData(e.currentTarget).get('q')?.toString().trim()
            router.push(q ? `/dashboard/customers?q=${encodeURIComponent(q)}` : '/dashboard/customers')
          }}
        >
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            name="q"
            type="search"
            placeholder="Buscar cliente por nombre, cédula o teléfono…"
            className="flex h-10 w-full rounded-md border border-input bg-background pl-10 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </form>

        <div className="flex items-center gap-1">
          {onToggleTheme && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleTheme}
              title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              aria-pressed={theme === 'dark'}
            >
              {theme === 'dark' ? <Sun className="h-5 w-5 text-amber-300" /> : <Moon className="h-5 w-5" />}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center space-x-2">
                <Avatar className="h-8 w-8">
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <span className="hidden md:inline">{name}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="text-sm font-medium">{name}</div>
                <div className="truncate text-xs text-muted-foreground">{email}</div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/dashboard/profile">
                  <User className="mr-2 h-4 w-4" />
                  Mi perfil
                </Link>
              </DropdownMenuItem>
              {isAdmin && (
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/settings">
                    <Settings className="mr-2 h-4 w-4" />
                    Configuración
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-red-600" onSelect={() => signOut({ callbackUrl: '/auth/login' })}>
                <LogOut className="mr-2 h-4 w-4" />
                Cerrar Sesión
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
