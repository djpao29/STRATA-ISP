import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/app/page-header'
import { DataTable } from '@/components/app/data-table'
import { StatusBadge } from '@/components/app/status-badge'
import { ActionButton } from '@/components/forms/action-form'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { formatDateTime } from '@/lib/format'
import { ROUTER_TYPE } from '@/lib/labels'
import { deleteRouter, testRouter } from './actions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { can } from '@/lib/permissions'
import { regenerateRouterKeys, routerWireguardScript, saveWireguardServer, useTunnelAddress } from './wireguard-actions'
import { WireguardScriptButton, WireguardServerForm } from './wireguard-ui'

export const metadata = { title: 'Routers' }

export default async function RoutersPage() {
  const user = await requireUser('routers')
  const routers = await prisma.router.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      host: true,
      port: true,
      type: true,
      status: true,
      lastCheckedAt: true,
      wgAddress: true,
      wgPublicKey: true,
      _count: { select: { services: { where: { isActive: true } } } },
    },
  })
  const wg = await prisma.wireguardServer.findUnique({ where: { tenantId: user.tenantId } })
  const isAdmin = can(user.role, 'settings')

  return (
    <div className="space-y-6">
      <PageHeader title="Routers" description="Equipos de borde donde se conectan los clientes. MikroTik: API REST de RouterOS 7">
        <Button asChild>
          <Link href="/dashboard/routers/new">
            <Plus className="mr-2 h-4 w-4" />
            Nuevo router
          </Link>
        </Button>
      </PageHeader>

      <DataTable
        headers={['Nombre', 'Tipo', 'Dirección', 'Túnel WireGuard', 'Servicios activos', 'Estado', 'Última comprobación', '']}
        rowCount={routers.length}
        emptyText="Todavía no hay routers registrados."
      >
        {routers.map((r) => (
          <tr key={r.id}>
            <td className="font-medium">{r.name}</td>
            <td>{ROUTER_TYPE[r.type]}</td>
            <td>
              {r.host}:{r.port}
              {r.wgAddress && r.host === r.wgAddress && <div className="text-xs text-green-700">por el túnel</div>}
            </td>
            <td className="font-mono text-xs">
              {r.wgAddress ?? '—'}
              {r.wgAddress && r.host !== r.wgAddress && (
                <div className="mt-1 font-sans">
                  <ActionButton action={useTunnelAddress} fields={{ id: r.id }} variant="ghost" size="sm" className="h-7 px-2 text-xs text-blue-700" confirm={`¿Conectar a ${r.name} por la IP del túnel (${r.wgAddress})? Hazlo cuando el túnel ya esté arriba.`}>
                    Usar IP del túnel
                  </ActionButton>
                </div>
              )}
            </td>
            <td>{r._count.services}</td>
            <td>
              <StatusBadge value={r.status} />
            </td>
            <td>{formatDateTime(r.lastCheckedAt)}</td>
            <td className="space-x-1 whitespace-nowrap text-right">
              {r.type === 'MIKROTIK' && (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/dashboard/monitoring/${r.id}`}>Monitorear</Link>
                </Button>
              )}
              <ActionButton action={testRouter} fields={{ id: r.id }} variant="outline" size="sm">
                Probar conexión
              </ActionButton>
              {r.type === 'MIKROTIK' && (
                <WireguardScriptButton
                  routerId={r.id}
                  routerName={r.name}
                  generate={routerWireguardScript}
                  disabledReason={wg ? null : 'Configura primero el servidor WireGuard (abajo)'}
                />
              )}
              {r.wgPublicKey && (
                <ActionButton action={regenerateRouterKeys} fields={{ id: r.id }} variant="ghost" size="sm" className="text-xs" confirm="¿Generar claves WireGuard nuevas? El túnel actual dejará de funcionar hasta que pegues el script nuevo y actualices el wg0.conf.">
                  Nuevas claves
                </ActionButton>
              )}
              <Button asChild variant="outline" size="sm">
                <Link href={`/dashboard/routers/${r.id}/edit`}>Editar</Link>
              </Button>
              <ActionButton
                action={deleteRouter}
                fields={{ id: r.id }}
                variant="ghost"
                size="sm"
                className="text-red-600"
                confirm="¿Eliminar este router?"
              >
                Eliminar
              </ActionButton>
            </td>
          </tr>
        ))}
      </DataTable>

      <Card id="wireguard" className="scroll-mt-20">
        <CardHeader>
          <CardTitle>VPN WireGuard</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Conecta tus MikroTik al servidor del sistema por un túnel WireGuard, para administrarlos aunque no tengan IP pública o estén detrás de NAT.
            Configura aquí el servidor, genera el script de cada router y aplica el wg0.conf en el servidor.
          </p>
          {wg && (
            <dl className="grid grid-cols-1 gap-2 rounded-md border bg-gray-50 p-3 text-sm md:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">Servidor</dt>
                <dd className="font-mono">
                  {wg.endpoint}:{wg.port} (UDP)
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Red del túnel / IP del servidor</dt>
                <dd className="font-mono">
                  {wg.network} · {wg.serverAddress}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Clave pública del servidor</dt>
                <dd className="break-all font-mono text-xs">{wg.publicKey}</dd>
              </div>
              <div className="md:col-span-3">
                {isAdmin ? (
                  <a href="/api/wireguard/server-config" className="inline-flex h-9 items-center rounded-md border bg-white px-3 text-sm font-medium hover:bg-gray-50">
                    Descargar wg0.conf del servidor ({routers.filter((r) => r.wgPublicKey && r.wgAddress).length} router(s))
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">Un administrador puede descargar el wg0.conf del servidor.</span>
                )}
              </div>
            </dl>
          )}
          {isAdmin ? (
            <WireguardServerForm action={saveWireguardServer} server={wg ? { endpoint: wg.endpoint, port: wg.port, network: wg.network } : null} />
          ) : (
            !wg && <p className="text-sm text-amber-700">Pide a un administrador que configure el servidor WireGuard.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
