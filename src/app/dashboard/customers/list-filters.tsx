'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { FileSpreadsheet, Loader2, Printer, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

type Option = { value: string; label: string }

/** Cambia un parámetro de la URL (y vuelve a la página 1). */
function useSetParam() {
  const router = useRouter()
  const sp = useSearchParams()
  const [pending, start] = useTransition()
  const set = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    next.delete('page')
    const s = next.toString()
    start(() => router.push(`/dashboard/customers${s ? `?${s}` : ''}`))
  }
  return { set, pending, sp }
}

const selectCls = 'h-9 rounded-md border border-gray-200 bg-white px-2.5 pr-7 text-sm text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export function FilterSelect({ name, value, options, label }: { name: string; value?: string; options: Option[]; label: string }) {
  const { set } = useSetParam()
  return (
    <select aria-label={label} value={value ?? ''} onChange={(e) => set({ [name]: e.target.value || undefined })} className={selectCls}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export function Tabs({ tabs, value, counts }: { tabs: readonly Option[]; value: string; counts: Record<string, number> }) {
  const { set } = useSetParam()
  return (
    <div className="flex flex-wrap rounded-lg border border-gray-200 bg-gray-50 p-1" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={value === t.value}
          onClick={() => set({ tab: t.value || undefined })}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm font-medium transition',
            value === t.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
          )}
        >
          {t.label}
          {counts[t.value] !== undefined && <span className="ml-1.5 text-xs text-gray-400">{counts[t.value]}</span>}
        </button>
      ))}
    </div>
  )
}

export function SearchBox({ value }: { value?: string }) {
  const { set, pending } = useSetParam()
  const [q, setQ] = useState(value ?? '')
  useEffect(() => setQ(value ?? ''), [value])
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        set({ q: q.trim() || undefined })
      }}
      className="relative w-full sm:w-72"
      role="search"
    >
      {pending ? (
        <Loader2 className="absolute left-2.5 top-2.5 h-4 w-4 animate-spin text-gray-400" />
      ) : (
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
      )}
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar nombre, código, cédula, teléfono, IP…"
        aria-label="Buscar cliente"
        className="h-9 w-full rounded-md border border-gray-200 bg-white pl-8 pr-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </form>
  )
}

export function ExportButtons({ canExport }: { canExport: boolean }) {
  const sp = useSearchParams()
  const qs = new URLSearchParams(sp.toString())
  qs.delete('page')
  qs.set('type', 'customers')
  return (
    <div className="flex gap-2 print:hidden">
      <button type="button" onClick={() => window.print()} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-red-600 px-3 text-sm font-semibold text-white shadow-sm hover:bg-red-700">
        <Printer className="h-4 w-4" />
        PDF
      </button>
      {canExport && (
        <a
          href={`/api/export?${qs.toString()}`}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-green-600 px-3 text-sm font-semibold text-white shadow-sm hover:bg-green-700"
        >
          <FileSpreadsheet className="h-4 w-4" />
          Excel
        </a>
      )}
    </div>
  )
}
