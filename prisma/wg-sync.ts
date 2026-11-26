/**
 * Imprime el wg0.conf del servidor WireGuard a partir de la base de datos (el mismo que descarga el panel),
 * para que el servidor lo aplique solo cada vez que se agrega un router. Si la empresa aún no tiene servidor
 * WireGuard, lo crea con las variables WG_ENDPOINT, WG_PORT y WG_NETWORK.
 *
 *   WG_ENDPOINT=203.0.113.10 npx tsx prisma/wg-sync.ts > /etc/wireguard/wg0.conf
 *
 * Con varias empresas, WG_TENANT_ID elige cuál (por defecto, la única que haya).
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { decrypt, encrypt } from '../src/lib/crypto'
import { firstHost, generateKeyPair, parseNetwork, serverConfig } from '../src/lib/wireguard'

const prisma = new PrismaClient()

async function tenantId() {
  if (process.env.WG_TENANT_ID) return process.env.WG_TENANT_ID
  const tenants = await prisma.tenant.findMany({ select: { id: true }, take: 2 })
  if (tenants.length !== 1) throw new Error(`Hay ${tenants.length} empresas: indica cuál con WG_TENANT_ID.`)
  return tenants[0].id
}

async function main() {
  const id = await tenantId()
  let server = await prisma.wireguardServer.findUnique({ where: { tenantId: id } })
  if (!server) {
    const endpoint = process.env.WG_ENDPOINT?.trim()
    if (!endpoint) throw new Error('No hay servidor WireGuard: define WG_ENDPOINT (IP pública o dominio) para crearlo.')
    const net = parseNetwork(process.env.WG_NETWORK || '10.200.0.0/24')
    if (!net) throw new Error('WG_NETWORK inválida (de /16 a /29, ej. 10.200.0.0/24).')
    const k = generateKeyPair()
    server = await prisma.wireguardServer.create({
      data: {
        tenantId: id,
        endpoint,
        port: Number(process.env.WG_PORT || 51820),
        network: net.network,
        serverAddress: firstHost(net.network),
        privateKeyEnc: encrypt(k.privateKey),
        publicKey: k.publicKey,
      },
    })
    console.error(`Servidor WireGuard creado: ${endpoint}:${server.port}, red ${server.network}.`)
  }
  const routers = await prisma.router.findMany({
    where: { tenantId: id, wgAddress: { not: null }, wgPublicKey: { not: null } },
    orderBy: { wgAddress: 'asc' },
    select: { name: true, wgAddress: true, wgPublicKey: true },
  })
  process.stdout.write(
    serverConfig(
      { ...server, privateKey: decrypt(server.privateKeyEnc) },
      routers.map((r) => ({ name: r.name, address: r.wgAddress!, publicKey: r.wgPublicKey! }))
    )
  )
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
