import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { getOltSettings } from '@/lib/olt/service'
import { cn } from '@/lib/utils'
import { SignalChart } from '../charts'
import { OnuStatus, RxPower, fmtUptime, pon } from '../shared'

export const metadata = { title: 'Salud de red' }

export default async function HealthPage() {
  const user = await requireUser('olt')
  const settings = await getOltSettings(user.tenantId)
  const [onus, olts] = await Promise.all([
    prisma.oNU.findMany({
      where: { olt: { tenantId: user.tenantId }, inOlt: true },
      select: { id: true, serial: true, slot: true, port: true, onuIndex: true, status: true, rxPower: true, prevRxPower: true, olt: { select: { id: true, name: true, frame: true } }, customer: { select: { id: true, firstName: true, lastName: true } } },
    }),
    prisma.oLT.findMany({ where: { tenantId: user.tenantId }, orderBy: { name: 'asc' } }),
  ])
  const withRx = onus.filter((o) => o.rxPower != null)
  const buckets = [
    { range: '> -20', min: -20, max: 99 },
    { range: '-20 a -23', min: -23, max: -20 },
    { range: '-23 a -25', min: -25, max: -23 },
    { range: `-25 a ${settings.lowSignal}`, min: settings.lowSignal, max: -25 },
    { range: `${settings.lowSignal} a ${settings.criticalSignal}`, min: settings.criticalSignal, max: settings.lowSignal },
    { range: `≤ ${settings.criticalSignal}`, min: -Infinity, max: settings.criticalSignal },
  ].map((b) => ({
    range: b.range,
    total: withRx.filter((o) => o.rxPower! > b.min && o.rxPower! <= b.max).length,
    level: (b.max <= settings.criticalSignal ? 'critical' : b.max <= settings.lowSignal ? 'low' : 'good') as 'good' | 'low' | 'critical',
  }))
  const avg = withRx.length ? Math.round((withRx.reduce((s, o) => s + o.rxPower!, 0) / withRx.length) * 100) / 100 : null
  const worst = [...withRx].sort((a, b) => a.rxPower! - b.rxPower!).slice(0, 15)
  const ports = new Map<string, { olt: string; oltId: string; port: string; total: number; online: number; low: number; avg: number[] }>()
  for (const o of onus) {
    const key = `${o.olt.id}|${pon(o.olt.frame, o.slot, o.port)}`
    const p = ports.get(key) ?? { olt: o.olt.name, oltId: o.olt.id, port: pon(o.olt.frame, o.slot, o.port), total: 0, online: 0, low: 0, avg: [] }
    p.total++
    if (o.status === 'ACTIVE') p.online++
    if (o.rxPower != null) {
      p.avg.push(o.rxPower)
      if (o.rxPower <= settings.lowSignal) p.low++
    }
    ports.set(key, p)
  }
  const health = withRx.length ? Math.round((withRx.filter((o) => o.rxPower! > settings.lowSignal).length / withRx.length) * 100) : null

  return (
    <div className="space-y-6">
      <PageHeader title="Salud de red" description={`Señal óptica recibida por las ONUs y estado por puerto PON. Umbrales: baja ≤ ${settings.lowSignal} dBm, crítica ≤ ${settings.criticalSignal} dBm.`}>
        <Link href="/dashboard/olt/alerts" className="rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50">
          Cambiar umbrales
        </Link>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Salud óptica', health != null ? `${health}%` : '—', 'ONUs con señal sobre el umbral'],
          ['Señal promedio', avg != null ? `${avg} dBm` : '—', `${withRx.length} ONUs con lectura`],
          ['Baja señal', String(withRx.filter((o) => o.rxPower! <= settings.lowSignal && o.rxPower! > settings.criticalSignal).length), `≤ ${settings.lowSignal} dBm`],
          ['Crítica', String(withRx.filter((o) => o.rxPower! <= settings.criticalSignal).length), `≤ ${settings.criticalSignal} dBm`],
        ].map(([l, v, h]) => (
          <div key={l} className="rounded-lg border bg-white p-4">
            <div className="text-xs text-muted-foreground">{l}</div>
            <div className="text-2xl font-semibold">{v}</div>
            <div className="text-xs text-muted-foreground">{h}</div>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Distribución de señal (dBm)</CardTitle>
        </CardHeader>
        <CardContent>{withRx.length ? <SignalChart data={buckets} /> : <p className="py-6 text-center text-sm text-muted-foreground">Sin lecturas de señal todavía.</p>}</CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Peor señal</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <tbody className="divide-y">
                {worst.map((o) => (
                  <tr key={o.id}>
                    <td className="py-1.5">
                      {o.customer ? (
                        <Link href={`/dashboard/customers/${o.customer.id}`} className="text-blue-700 hover:underline">
                          {o.customer.firstName} {o.customer.lastName}
                        </Link>
                      ) : (
                        <span className="font-mono text-xs">{o.serial}</span>
                      )}
                      <div className="font-mono text-[11px] text-muted-foreground">
                        {o.olt.name} · {pon(o.olt.frame, o.slot, o.port, o.onuIndex)}
                      </div>
                    </td>
                    <td>
                      <OnuStatus status={o.status} />
                    </td>
                    <td className="text-right">
                      <RxPower value={o.rxPower} low={settings.lowSignal} critical={settings.criticalSignal} />
                      {o.prevRxPower != null && o.rxPower != null && Math.abs(o.rxPower - o.prevRxPower) >= 0.5 && (
                        <div className="text-[11px] text-muted-foreground">antes {o.prevRxPower}</div>
                      )}
                    </td>
                  </tr>
                ))}
                {worst.length === 0 && (
                  <tr>
                    <td className="py-4 text-center text-muted-foreground">Sin datos.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Puertos PON</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-gray-500">
                <tr>
                  <th className="py-1">OLT · PON</th>
                  <th>En línea</th>
                  <th>Baja señal</th>
                  <th>Promedio</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {[...ports.values()].map((p) => {
                  const a = p.avg.length ? Math.round((p.avg.reduce((s, x) => s + x, 0) / p.avg.length) * 100) / 100 : null
                  return (
                    <tr key={`${p.oltId}${p.port}`}>
                      <td className="py-1.5">
                        {p.olt} <span className="font-mono text-xs">{p.port}</span>
                      </td>
                      <td className={cn(p.online === 0 && p.total > 0 && 'font-semibold text-red-700')}>
                        {p.online}/{p.total}
                      </td>
                      <td className={cn(p.low && 'text-amber-700')}>{p.low}</td>
                      <td>
                        <RxPower value={a} low={settings.lowSignal} critical={settings.criticalSignal} />
                      </td>
                    </tr>
                  )
                })}
                {ports.size === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-muted-foreground">
                      Sin datos.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">OLTs</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {olts.map((o) => (
            <div key={o.id} className="rounded-md border p-3 text-sm">
              <div className="font-medium">{o.name}</div>
              <div className={cn('text-xs', o.status === 'ONLINE' ? 'text-green-700' : o.status === 'OFFLINE' ? 'text-red-700' : 'text-muted-foreground')}>
                {o.status === 'ONLINE' ? 'En línea' : o.status === 'OFFLINE' ? 'Sin respuesta' : 'Sin leer'}
              </div>
              <div className="text-xs text-muted-foreground">
                Temperatura {o.temperature != null ? `${o.temperature} °C` : '—'} · encendida {fmtUptime(o.uptimeSec)}
              </div>
            </div>
          ))}
          {olts.length === 0 && <p className="text-sm text-muted-foreground">No hay OLTs.</p>}
        </CardContent>
      </Card>
    </div>
  )
}
