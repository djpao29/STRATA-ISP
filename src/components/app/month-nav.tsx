import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/** Selector de mes con flechas (usa ?month=AAAA-MM). */
export function MonthNav({ basePath, label, prev, next, extra }: { basePath: string; label: string; prev: string; next: string; extra?: string }) {
  const href = (m: string) => `${basePath}?month=${m}${extra ? `&${extra}` : ''}`
  return (
    <div className="flex items-center gap-1 rounded-md border bg-white">
      <Link href={href(prev)} aria-label="Mes anterior" className="px-2 py-1.5 hover:bg-accent">
        <ChevronLeft className="h-4 w-4" />
      </Link>
      <span className="min-w-[9rem] text-center text-sm font-medium capitalize">{label}</span>
      <Link href={href(next)} aria-label="Mes siguiente" className="px-2 py-1.5 hover:bg-accent">
        <ChevronRight className="h-4 w-4" />
      </Link>
    </div>
  )
}
