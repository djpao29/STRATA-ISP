import { generateKeyPairSync } from 'crypto'

/**
 * WireGuard: los routers abren un túnel hacia el servidor del sistema para que este llegue a ellos
 * aunque no tengan IP pública. Claves Curve25519 en el formato de WireGuard (32 bytes en base64).
 */

export function generateKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('x25519')
  // DER: los últimos 32 bytes son la clave cruda.
  const pub = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32)
  const priv = privateKey.export({ format: 'der', type: 'pkcs8' }).subarray(-32)
  return { publicKey: pub.toString('base64'), privateKey: priv.toString('base64') }
}

export const isWgKey = (k: string) => /^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw480]=$/.test(k)

// ── Red del túnel ───────────────────────────────────────────────────────────

const ipToInt = (ip: string) => ip.split('.').reduce((a, o) => (a << 8) + Number(o), 0) >>> 0
const intToIp = (n: number) => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.')

/** "10.200.0.0/24" → red, prefijo y rango de hosts. null si no es válida (se aceptan /16 a /29). */
export function parseNetwork(cidr: string) {
  const m = /^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/.exec(cidr.trim())
  if (!m || m[1].split('.').some((o) => Number(o) > 255)) return null
  const prefix = Number(m[2])
  if (prefix < 16 || prefix > 29) return null
  const mask = (0xffffffff << (32 - prefix)) >>> 0
  const base = (ipToInt(m[1]) & mask) >>> 0
  const size = 2 ** (32 - prefix)
  return { network: `${intToIp(base)}/${prefix}`, prefix, first: base + 1, last: base + size - 2, contains: (ip: string) => ((ipToInt(ip) & mask) >>> 0) === base }
}

/** Primera IP libre de la red (sin la del servidor ni las ya asignadas). */
export function nextFreeAddress(cidr: string, taken: string[]) {
  const net = parseNetwork(cidr)
  if (!net) throw new Error('Red del túnel inválida.')
  const used = new Set(taken.map(ipToInt))
  for (let n = net.first; n <= net.last; n++) if (!used.has(n)) return intToIp(n)
  throw new Error('No quedan IPs libres en la red del túnel. Usa una red más grande.')
}

export const firstHost = (cidr: string) => {
  const net = parseNetwork(cidr)
  if (!net) throw new Error('Red del túnel inválida.')
  return intToIp(net.first)
}

// ── Script de RouterOS 7 ────────────────────────────────────────────────────

export type WgServer = { endpoint: string; port: number; network: string; serverAddress: string; publicKey: string }
export type WgRouter = { name: string; address: string; privateKey: string }

const IFACE = 'wg-wispx'
const TAG = 'WISPX'
const q = (s: string) => s.replace(/["\\$]/g, '\\$&')

/**
 * Script para pegar en la terminal del MikroTik (RouterOS 7). Es repetible: primero quita lo que haya
 * creado antes con la marca WISPX y vuelve a crearlo. Solo abre el router al servidor por el túnel.
 */
export function routerScript(server: WgServer, router: WgRouter) {
  const prefix = parseNetwork(server.network)!.prefix
  return [
    `# ${TAG}: túnel WireGuard de "${q(router.name)}" hacia el servidor del sistema`,
    `# Requiere RouterOS 7. Pégalo en New Terminal (Winbox) o súbelo y ejecútalo con /import.`,
    `:log info "${TAG}: configurando WireGuard"`,
    `/ip firewall filter remove [find comment~"${TAG}"]`,
    `/ip address remove [find comment="${TAG}"]`,
    `/interface wireguard peers remove [find comment="${TAG} servidor"]`,
    `/interface wireguard remove [find name="${IFACE}"]`,
    `/interface wireguard add name=${IFACE} listen-port=13231 mtu=1420 private-key="${router.privateKey}" comment="${TAG}"`,
    `/interface wireguard peers add interface=${IFACE} public-key="${server.publicKey}" endpoint-address=${q(server.endpoint)} endpoint-port=${server.port} allowed-address=${server.serverAddress}/32 persistent-keepalive=25s comment="${TAG} servidor"`,
    `/ip address add address=${router.address}/${prefix} interface=${IFACE} comment="${TAG}"`,
    `# Permite al servidor del sistema (y solo a él) entrar por el túnel: API REST, Winbox y SSH.`,
    `:if ([:len [/ip firewall filter find]] > 0) do={`,
    `  /ip firewall filter add chain=input in-interface=${IFACE} src-address=${server.serverAddress} action=accept comment="${TAG}: acceso del sistema por el tunel" place-before=0`,
    `} else={`,
    `  /ip firewall filter add chain=input in-interface=${IFACE} src-address=${server.serverAddress} action=accept comment="${TAG}: acceso del sistema por el tunel"`,
    `}`,
    `:log info "${TAG}: WireGuard listo (${router.address} -> ${server.serverAddress})"`,
    `:put "${TAG}: listo. IP del router en el tunel: ${router.address}"`,
    '',
  ].join('\n')
}

/** Configuración del servidor (wg-quick en Linux o WireGuard para Windows) con un peer por router. */
export function serverConfig(server: WgServer & { privateKey: string }, routers: Array<{ name: string; address: string; publicKey: string }>) {
  const prefix = parseNetwork(server.network)!.prefix
  return [
    `# Servidor WireGuard del sistema (${server.network}). Generado por el panel: no lo edites a mano.`,
    `# Linux: guárdalo como /etc/wireguard/wg0.conf y ejecuta: wg-quick up wg0  (o systemctl enable --now wg-quick@wg0)`,
    `# Windows: WireGuard › Importar túnel desde archivo.`,
    `[Interface]`,
    `Address = ${server.serverAddress}/${prefix}`,
    `ListenPort = ${server.port}`,
    `PrivateKey = ${server.privateKey}`,
    '',
    ...routers.flatMap((r) => [`[Peer]`, `# ${r.name.replace(/[\r\n]/g, ' ')}`, `PublicKey = ${r.publicKey}`, `AllowedIPs = ${r.address}/32`, '']),
  ].join('\n')
}
