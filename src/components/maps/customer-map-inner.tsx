'use client'

import 'leaflet/dist/leaflet.css'
import { useEffect } from 'react'
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet'
import { latLngBounds } from 'leaflet'
import type { MapPoint } from './customer-map'

function FitBounds({ points }: { points: MapPoint[] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length === 0) return
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 15)
      return
    }
    map.fitBounds(latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])), { padding: [40, 40], maxZoom: 16 })
  }, [map, points])
  return null
}

export default function CustomerMapInner({ points, fallbackCenter }: { points: MapPoint[]; fallbackCenter: [number, number] }) {
  return (
    <MapContainer center={fallbackCenter} zoom={8} scrollWheelZoom className="h-full w-full rounded-lg" style={{ minHeight: 480 }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      <FitBounds points={points} />
      {points.map((p) => (
        <CircleMarker key={p.id} center={[p.lat, p.lng]} radius={8} pathOptions={{ color: '#ffffff', weight: 2, fillColor: p.color, fillOpacity: 0.95 }}>
          <Popup>
            <div className="min-w-[12rem] space-y-1 text-sm">
              <a href={p.href} className="font-semibold text-blue-700 hover:underline">{p.name}</a>
              {p.lines.map((l) => (
                <div key={l} className="text-xs text-gray-600">{l}</div>
              ))}
              <div className="flex flex-wrap gap-2 pt-1 text-xs">
                {p.actionHref && (
                  <a href={p.actionHref} className="rounded bg-blue-600 px-2 py-1 font-medium text-white hover:bg-blue-700" style={{ color: '#fff' }}>
                    {p.actionLabel}
                  </a>
                )}
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded border px-2 py-1 hover:bg-gray-50"
                >
                  Cómo llegar
                </a>
              </div>
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  )
}
