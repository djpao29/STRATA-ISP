'use client'

import dynamic from 'next/dynamic'


export type MapPoint = {
  id: string
  name: string
  lat: number
  lng: number
  color: string
  lines: string[]
  href: string
  actionHref?: string
  actionLabel?: string
}

// Leaflet usa "window": se carga solo en el navegador.
const Inner = dynamic(() => import('./customer-map-inner'), {
  ssr: false,
  loading: () => <div className="flex h-[480px] items-center justify-center rounded-lg bg-gray-100 text-sm text-muted-foreground">Cargando mapa…</div>,
})

export function CustomerMap({ points, fallbackCenter = [18.48, -69.93] }: { points: MapPoint[]; fallbackCenter?: [number, number] }) {
  return (
    <div className="h-[60vh] min-h-[480px] overflow-hidden rounded-lg border">
      <Inner points={points} fallbackCenter={fallbackCenter} />
    </div>
  )
}

export function Legend({ items }: { items: Array<{ color: string; label: string; count: number }> }) {
  return (
    <div className="flex flex-wrap gap-3 text-sm">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full border border-white shadow" style={{ background: i.color }} />
          {i.label} <span className="text-muted-foreground">({i.count})</span>
        </span>
      ))}
    </div>
  )
}
