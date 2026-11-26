import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'
import { audit } from '@/lib/audit'
import { apiUser } from '@/lib/monitoring/api-auth'
import { serverConfig } from '@/lib/wireguard'

export const dynamic = 'force-dynamic'

/** wg0.conf del servidor (lleva su clave privada: solo administradores). */
export async function GET() {
  const { user, error } = await apiUser('settings')
  if (error) return error
  const server = await prisma.wireguardServer.findUnique({ where: { tenantId: user.tenantId } })
  if (!server) return NextResponse.json({ error: 'Servidor WireGuard sin configurar' }, { status: 404 })
  const routers = await prisma.router.findMany({
    where: { tenantId: user.tenantId, wgAddress: { not: null }, wgPublicKey: { not: null } },
    orderBy: { wgAddress: 'asc' },
    select: { name: true, wgAddress: true, wgPublicKey: true },
  })
  const conf = serverConfig(
    { endpoint: server.endpoint, port: server.port, network: server.network, serverAddress: server.serverAddress, publicKey: server.publicKey, privateKey: decrypt(server.privateKeyEnc) },
    routers.map((r) => ({ name: r.name, address: r.wgAddress!, publicKey: r.wgPublicKey! }))
  )
  await audit({ tenantId: user.tenantId, userId: user.id, action: 'wireguard.server_config', entity: 'WireguardServer', details: { peers: routers.length } })
  return new NextResponse(conf, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': 'attachment; filename="wg0.conf"', 'Cache-Control': 'no-store' },
  })
}
