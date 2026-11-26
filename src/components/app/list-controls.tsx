import Link from 'next/link'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'

export const PAGE_SIZE = 25

export function parsePage(value: string | string[] | undefined) {
  const n = Number(Array.isArray(value) ? value[0] : value)
  return Number.isInteger(n) && n > 0 ? n : 1
}

export function param(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() || undefined
}

/** Buscador y filtro por estado que funcionan con parámetros de la URL (sin JavaScript). */
export function SearchBar({
  q,
  placeholder,
  status,
  statusOptions,
}: {
  q?: string
  placeholder: string
  status?: string
  statusOptions?: Array<{ value: string; label: string }>
}) {
  return (
    <form className="flex flex-col gap-2 sm:flex-row" role="search">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          name="q"
          defaultValue={q}
          placeholder={placeholder}
          className="flex h-10 w-full rounded-md border border-input bg-background pl-10 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      {statusOptions && (
        <select
          name="status"
          defaultValue={status ?? ''}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">Todos los estados</option>
          {statusOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
      <Button type="submit" variant="secondary">
        Filtrar
      </Button>
    </form>
  )
}

export function Pagination({
  page,
  total,
  basePath,
  params,
}: {
  page: number
  total: number
  basePath: string
  params: Record<string, string | undefined>
}) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  if (pages <= 1) return null
  const href = (p: number) => {
    const sp = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => v && sp.set(k, v))
    sp.set('page', String(p))
    return `${basePath}?${sp.toString()}`
  }
  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span>
        Página {page} de {pages} · {total} registros
      </span>
      <div className="flex gap-2">
        {page > 1 && (
          <Button asChild variant="outline" size="sm">
            <Link href={href(page - 1)}>Anterior</Link>
          </Button>
        )}
        {page < pages && (
          <Button asChild variant="outline" size="sm">
            <Link href={href(page + 1)}>Siguiente</Link>
          </Button>
        )}
      </div>
    </div>
  )
}
