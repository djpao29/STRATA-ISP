'use client'

import 'leaflet/dist/leaflet.css'
import { useEffect, useMemo } from 'react'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { divIcon } from 'leaflet'

export type BaseLayer = 'osm' | 'satellite' | 'hybrid'

const ESRI_IMAGERY = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const ESRI_LABELS = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'
const ESRI_ROADS = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}'

const pin = divIcon({
  className: '',
  html: '<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:#dc2626;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5);transform:rotate(-45deg)"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 22],
})

function ClickToPlace({ onPick }: { onPick: (p: [number, number]) => void }) {
  useMapEvents({ click: (e) => onPick([e.latlng.lat, e.latlng.lng]) })
  return null
}

function Follow({ point, zoom }: { point: [number, number] | null; zoom: number }) {
  const map = useMap()
  useEffect(() => {
    if (point) map.setView(point, Math.max(map.getZoom(), zoom))
  }, [map, point, zoom])
  return null
}

export default function LocationPickerInner({
  point,
  center,
  layer,
  onPick,
}: {
  point: [number, number] | null
  center: [number, number]
  layer: BaseLayer
  onPick: (p: [number, number]) => void
}) {
  const handlers = useMemo(
    () => ({
      dragend: (e: { target: { getLatLng: () => { lat: number; lng: number } } }) => {
        const ll = e.target.getLatLng()
        onPick([ll.lat, ll.lng])
      },
    }),
    [onPick]
  )
  return (
    <MapContainer center={point ?? center} zoom={point ? 17 : 12} scrollWheelZoom className="h-full w-full">
      {layer === 'osm' ? (
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />
      ) : (
        <TileLayer attribution="Imágenes &copy; Esri, Maxar, Earthstar Geographics" url={ESRI_IMAGERY} maxZoom={19} />
      )}
      {layer === 'hybrid' && (
        <>
          <TileLayer url={ESRI_ROADS} maxZoom={19} />
          <TileLayer url={ESRI_LABELS} maxZoom={19} />
        </>
      )}
      <ClickToPlace onPick={onPick} />
      <Follow point={point} zoom={16} />
      {point && <Marker position={point} draggable icon={pin} eventHandlers={handlers} />}
    </MapContainer>
  )
}
