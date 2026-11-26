'use client'

import 'leaflet/dist/leaflet.css'
import { useEffect } from 'react'
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import { latLngBounds } from 'leaflet'
import type { FtthData } from './ftth-map'

function Fit({ pts }: { pts: Array<[number, number]> }) {
  const map = useMap()
  useEffect(() => {
    if (pts.length === 1) map.setView(pts[0], 16)
    else if (pts.length > 1) map.fitBounds(latLngBounds(pts), { padding: [40, 40], maxZoom: 17 })
  }, [map, pts])
  return null
}

export default function FtthMapInner({ data, center }: { data: FtthData; center: [number, number] }) {
  const pts = [...data.olts, ...data.naps, ...data.clients].map((p) => p.pos)
  return (
    <MapContainer center={center} zoom={12} scrollWheelZoom className="h-full w-full">
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />
      <Fit pts={pts} />
      {data.links.map((l, i) => (
        <Polyline key={i} positions={[l.from, l.to]} pathOptions={{ color: l.kind === 'feeder' ? '#2563eb' : l.ok ? '#10b981' : '#ef4444', weight: l.kind === 'feeder' ? 3 : 1.5, dashArray: l.kind === 'feeder' ? undefined : '4 4' }} />
      ))}
      {data.clients.map((c) => (
        <CircleMarker key={c.id} center={c.pos} radius={6} pathOptions={{ color: '#fff', weight: 1.5, fillColor: c.color, fillOpacity: 1 }}>
          <Popup>
            <strong>{c.name}</strong>
            {c.lines.map((l) => (
              <div key={l}>{l}</div>
            ))}
            <a href={c.href}>Ver ficha</a>
          </Popup>
        </CircleMarker>
      ))}
      {data.naps.map((n) => (
        <CircleMarker key={n.id} center={n.pos} radius={9} pathOptions={{ color: '#7c3aed', weight: 3, fillColor: '#ede9fe', fillOpacity: 1 }}>
          <Popup>
            <strong>{n.name}</strong>
            {n.lines.map((l) => (
              <div key={l}>{l}</div>
            ))}
          </Popup>
        </CircleMarker>
      ))}
      {data.olts.map((o) => (
        <CircleMarker key={o.id} center={o.pos} radius={12} pathOptions={{ color: '#1e3a8a', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }}>
          <Popup>
            <strong>OLT {o.name}</strong>
            {o.lines.map((l) => (
              <div key={l}>{l}</div>
            ))}
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  )
}
