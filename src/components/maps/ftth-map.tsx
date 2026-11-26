'use client'

import dynamic from 'next/dynamic'

type Pt = { id: string; name: string; pos: [number, number]; lines: string[] }
export type FtthData = {
  olts: Pt[]
  naps: Pt[]
  clients: Array<Pt & { color: string; href: string }>
  /** feeder: OLT → NAP · drop: NAP → cliente */
  links: Array<{ from: [number, number]; to: [number, number]; kind: 'feeder' | 'drop'; ok: boolean }>
}

const Inner = dynamic(() => import('./ftth-map-inner'), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center bg-gray-100 text-sm text-muted-foreground">Cargando mapa…</div>,
})

export function FtthMap({ data, center = [18.4861, -69.9312] }: { data: FtthData; center?: [number, number] }) {
  return (
    <div className="h-[65vh] min-h-[480px] overflow-hidden rounded-lg border">
      <Inner data={data} center={center} />
    </div>
  )
}
