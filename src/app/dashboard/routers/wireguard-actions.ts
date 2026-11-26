'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireActionUser } from '@/lib/session'
import { audit } from '@/lib/audit'
import { decrypt, encrypt } from '@/lib/crypto'
import { HOST_REGEX } from '@/lib/net'
import { formToObject, toActionError, type ActionState } from '@/lib/actions'
import { firstHost, generateKeyPair, nextFreeAddress, parseNetwork, routerScript } from '@/lib/wireguard'

const refresh = () => revalidatePath('/dashboard/routers', 'layout')

/** Servidor WireGuard de la empresa (crea sus claves la primera vez). */
export async function saveWireguardServer(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('settings')
    const d = z
      .object({
        endpoint: z.string({ required_error: 'Obligatorio' }).regex(HOST_REGEX, 'IP pública o dominio del servidor'),
        port: z.coerce.number().int().min(1).max(65535).default(51820),
        network: z.string({ required_error: 'Obligatorio' }).refine((v) => parseNetwork(v) !== null, 'Red privada de /16 a /29 (ej. 10.200.0.0/24)'),
      })
      .parse(formToObject(formData))
    const network = parseNetwork(d.network)!.network
    const serverAddress = firstHost(network)
    const current = await prisma.wireguardServer.findUnique({ where: { tenantId: user.tenantId } })
    let note = ''
    if (current) {
      await prisma.wireguardServer.update({ where: { tenantId: user.tenantId }, data: { endpoint: d.endpoint, port: d.port, network, serverAddress } })
      // Si cambia la red, las IPs del túnel de los routers ya no sirven: se reasignan al generar el script.
      if (current.network !== network) {
        const r = await prisma.router.updateMany({ where: { tenantId: user.tenantId, wgAddress: { not: null } }, data: { wgAddress: null } })
        if (r.count) note = ` Cambió la red: vuelve a generar el script de ${r.count} router(s).`
      } else if (current.endpoint !== d.endpoint || current.port !== d.port) {
        note = ' Cambió la dirección o el puerto: vuelve a generar el script de cada router.'
      }
    } else {
      const k = generateKeyPair()
      await prisma.wireguardServer.create({ data: { tenantId: user.tenantId, endpoint: d.endpoint, port: d.port, network, serverAddress, privateKeyEnc: encrypt(k.privateKey), publicKey: k.publicKey } })
    }
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'wireguard.server', entity: 'WireguardServer', details: { endpoint: d.endpoint, port: d.port, network } })
    refresh()
    return { ok: true, message: `Servidor WireGuard guardado.${note}` }
  } catch (error) {
    return toActionError(error)
  }
}

/** Genera (o devuelve) el script de RouterOS del router: le asigna IP del túnel y claves si no tiene. */
export async function routerWireguardScript(routerId: string): Promise<{ error?: string; script?: string; address?: string }> {
  try {
    const user = await requireActionUser('routers')
    const server = await prisma.wireguardServer.findUnique({ where: { tenantId: user.tenantId } })
    if (!server) return { error: 'Configura primero el servidor WireGuard (Routers › VPN WireGuard).' }
    const router = await prisma.router.findFirst({ where: { id: routerId, tenantId: user.tenantId } })
    if (!router) return { error: 'El router no existe.' }
    if (router.type !== 'MIKROTIK') return { error: 'El script es para MikroTik (RouterOS 7).' }

    let { wgAddress, wgPrivateKeyEnc, wgPublicKey } = router
    if (!wgAddress || !parseNetwork(server.network)!.contains(wgAddress)) {
      const taken = (await prisma.router.findMany({ where: { tenantId: user.tenantId, wgAddress: { not: null }, id: { not: router.id } }, select: { wgAddress: true } })).map((r) => r.wgAddress!)
      wgAddress = nextFreeAddress(server.network, [server.serverAddress, ...taken])
    }
    if (!wgPrivateKeyEnc || !wgPublicKey) {
      const k = generateKeyPair()
      wgPrivateKeyEnc = encrypt(k.privateKey)
      wgPublicKey = k.publicKey
    }
    await prisma.router.update({ where: { id: router.id }, data: { wgAddress, wgPrivateKeyEnc, wgPublicKey } })
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'wireguard.script', entity: 'Router', entityId: router.id, details: { address: wgAddress } })
    refresh()
    return {
      address: wgAddress,
      script: routerScript(
        { endpoint: server.endpoint, port: server.port, network: server.network, serverAddress: server.serverAddress, publicKey: server.publicKey },
        { name: router.name, address: wgAddress, privateKey: decrypt(wgPrivateKeyEnc) }
      ),
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Error desconocido' }
  }
}

/** Cambia las claves del router (el script anterior deja de servir). */
export async function regenerateRouterKeys(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('routers')
    const id = z.string().parse(formData.get('id'))
    const router = await prisma.router.findFirst({ where: { id, tenantId: user.tenantId } })
    if (!router) throw new Error('El router no existe.')
    const k = generateKeyPair()
    await prisma.router.update({ where: { id }, data: { wgPrivateKeyEnc: encrypt(k.privateKey), wgPublicKey: k.publicKey } })
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'wireguard.rekey', entity: 'Router', entityId: id })
    refresh()
    return { ok: true, message: 'Claves nuevas generadas: vuelve a pegar el script en el MikroTik y actualiza el wg0.conf del servidor.' }
  } catch (error) {
    return toActionError(error)
  }
}

/** Hace que el sistema se conecte al router por la IP del túnel. */
export async function useTunnelAddress(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser('routers')
    const id = z.string().parse(formData.get('id'))
    const router = await prisma.router.findFirst({ where: { id, tenantId: user.tenantId } })
    if (!router?.wgAddress) throw new Error('Genera primero el script WireGuard de este router.')
    await prisma.router.update({ where: { id }, data: { host: router.wgAddress } })
    await audit({ tenantId: user.tenantId, userId: user.id, action: 'wireguard.use_tunnel', entity: 'Router', entityId: id, details: { from: router.host, to: router.wgAddress } })
    refresh()
    return { ok: true, message: `El sistema usará ${router.wgAddress} (túnel) para conectarse a ${router.name}. Antes era ${router.host}.` }
  } catch (error) {
    return toActionError(error)
  }
}
