'use client'

import dynamic from 'next/dynamic'
import { useCallback, useState } from 'react'
import { LocateFixed } from 'lucide-react'
import { encodePlusCode, parsePlusCode } from '@/lib/pluscode'
import { cn } from '@/lib/utils'
import type { BaseLayer } from './location-picker-inner'

const Inner = dynamic(() => import('./location-picker-inner'), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center bg-gray-100 text-sm text-muted-foreground">Cargando mapa…</div>,
})

const LAYERS: Array<{ key: BaseLayer; label: string }> = [
  { key: 'osm', label: 'OpenStreetMap' },
  { key: 'satellite', label: 'Satélite' },
  { key: 'hybrid', label: 'Híbrido' },
]

const round = (n: number) => Math.round(n * 1e6) / 1e6

/**
 * Elegir la ubicación de la instalación: clic en el mapa, arrastrar el pin, GPS del equipo,
 * escribir latitud/longitud o pegar un Plus Code. Envía "coordinates" = "lat,lng".
 */
export function LocationPicker({ defaultValue, center = [18.4861, -69.9312] }: { defaultValue?: string | null; center?: [number, number] }) {
  const initial = (() => {
    const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(defaultValue ?? '')
    return m ? ([Number(m[1]), Number(m[2])] as [number, number]) : null
  })()
  const [point, setPoint] = useState<[number, number] | null>(initial)
  const [layer, setLayer] = useState<BaseLayer>('hybrid')
  const [plus, setPlus] = useState(initial ? encodePlusCode(initial[0], initial[1]) : '')
  const [msg, setMsg] = useState<string | null>(null)

  const pick = useCallback((p: [number, number]) => {
    const r: [number, number] = [round(p[0]), round(p[1])]
    setPoint(r)
    setPlus(encodePlusCode(r[0], r[1]))
    setMsg(null)
  }, [])

  const gps = () => {
    if (!navigator.geolocation) return setMsg('Este navegador no permite obtener la ubicación.')
    setMsg('Obteniendo ubicación…')
    navigator.geolocation.getCurrentPosition(
      (pos) => pick([pos.coords.latitude, pos.coords.longitude]),
      (err) => setMsg(err.code === 1 ? 'Permiso de ubicación denegado en el navegador.' : 'No se pudo obtener la ubicación.'),
      { enableHighAccuracy: true, timeout: 15000 }
    )
  }

  const setCoord = (i: 0 | 1, v: string) => {
    const n = Number(v)
    const limit = i === 0 ? 90 : 180
    if (v.trim() === '' || !Number.isFinite(n) || Math.abs(n) > limit) return
    const base = point ?? center
    pick(i === 0 ? [n, base[1]] : [base[0], n])
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name="coordinates" value={point ? `${point[0]},${point[1]}` : ''} />
      <p className="text-xs text-muted-foreground">
        Haz clic en el mapa o usa <strong>Mi ubicación</strong> (GPS). Arrastra el pin para afinar. Cambia a <strong>Satélite</strong> si no ves la casa en el mapa de calles.
      </p>
      <div className="flex flex-wrap gap-1">
        {LAYERS.map((l) => (
          <button
            key={l.key}
            type="button"
            onClick={() => setLayer(l.key)}
            className={cn('rounded border px-2.5 py-1 text-xs font-medium', layer === l.key ? 'border-blue-600 bg-blue-600 text-white' : 'bg-white hover:bg-gray-50')}
          >
            {l.label}
          </button>
        ))}
        <button type="button" onClick={gps} className="inline-flex items-center gap-1 rounded border border-green-300 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-800 hover:bg-green-100">
          <LocateFixed className="h-3.5 w-3.5" />
          Mi ubicación
        </button>
      </div>
      <div className="h-64 overflow-hidden rounded-md border sm:h-72">
        <Inner point={point} center={center} layer={layer} onPick={pick} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1 text-sm">
          <span className="font-medium">Latitud</span>
          <input
            key={`lat-${point?.[0]}`}
            defaultValue={point?.[0] ?? ''}
            onBlur={(e) => setCoord(0, e.target.value)}
            placeholder="18.486100"
            inputMode="decimal"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 font-mono text-sm"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Longitud</span>
          <input
            key={`lng-${point?.[1]}`}
            defaultValue={point?.[1] ?? ''}
            onBlur={(e) => setCoord(1, e.target.value)}
            placeholder="-69.931200"
            inputMode="decimal"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 font-mono text-sm"
          />
        </label>
        <label className="col-span-2 space-y-1 text-sm sm:col-span-1">
          <span className="font-medium">Plus Code (Google Maps)</span>
          <input
            value={plus}
            onChange={(e) => setPlus(e.target.value)}
            onBlur={(e) => {
              if (!e.target.value.trim()) return
              const p = parsePlusCode(e.target.value, point ?? center)
              if (p) pick(p)
              else setMsg('Plus Code no válido. Ej: 66GQ+G63 o 87G866GQ+G63')
            }}
            placeholder="Ej: 66GQ+G63 Santo Domingo"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 font-mono text-sm"
          />
          <span className="text-xs text-muted-foreground">Se genera al marcar el mapa. También puedes pegar uno de Google Maps.</span>
        </label>
      </div>
      {msg ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{msg}</p>
      ) : !point ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">Sin coordenadas aún. Selecciona un punto en el mapa o usa GPS.</p>
      ) : (
        <button type="button" onClick={() => { setPoint(null); setPlus('') }} className="text-xs text-red-700 hover:underline">
          Quitar ubicación
        </button>
      )}
    </div>
  )
}
