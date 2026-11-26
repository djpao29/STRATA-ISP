import { rosGet, rosWrite, RouterOSError, type RouterConnection } from './client'
import { toBool, type RosRecord } from './parse'

/**
 * Corte y reconexión de clientes en RouterOS. Todas las operaciones son idempotentes:
 * repetir un corte o una reconexión ya aplicados no cambia nada.
 *
 * Métodos:
 * - PPPoE: se deshabilita el usuario en /ppp/secret y se cierra su sesión activa.
 *   Al reconectar se vuelve a habilitar (el cliente se reconecta solo).
 * - IP estática / DHCP: se agrega la IP a una address-list (por defecto "morosos") que debe
 *   estar bloqueada por una regla de firewall del router. Al reconectar se quita de la lista.
 */

export type ActionResult = { method: 'ppp_secret' | 'address_list'; detail: string }

const COMMENT_PREFIX = 'wispx-corte'

async function findSecret(conn: RouterConnection, user: string) {
  const rows = await rosGet<RosRecord[]>(conn, '/ppp/secret', ['.id', 'name', 'disabled'], { name: user })
  const secret = rows.find((r) => r.name === user)
  if (!secret?.['.id']) {
    throw new RouterOSError(`El usuario PPPoE "${user}" no existe en el router (/ppp/secret).`, 'not_found')
  }
  return secret
}

export async function suspendPppoe(conn: RouterConnection, user: string): Promise<ActionResult> {
  const secret = await findSecret(conn, user)
  if (!toBool(secret.disabled)) await rosWrite(conn, 'PATCH', `/ppp/secret/${secret['.id']}`, { disabled: 'yes' })
  // Cerrar la sesión activa: sin esto el cliente seguiría navegando hasta reconectarse.
  const active = await rosGet<RosRecord[]>(conn, '/ppp/active', ['.id', 'name'], { name: user })
  let closed = 0
  for (const s of active.filter((a) => a.name === user && a['.id'])) {
    await rosWrite(conn, 'DELETE', `/ppp/active/${s['.id']}`)
    closed++
  }
  return { method: 'ppp_secret', detail: `Usuario PPPoE ${user} deshabilitado${closed ? `, ${closed} sesión(es) cerrada(s)` : ''}` }
}

export async function reconnectPppoe(conn: RouterConnection, user: string): Promise<ActionResult> {
  const secret = await findSecret(conn, user)
  if (toBool(secret.disabled)) await rosWrite(conn, 'PATCH', `/ppp/secret/${secret['.id']}`, { disabled: 'no' })
  return { method: 'ppp_secret', detail: `Usuario PPPoE ${user} habilitado` }
}

async function listEntries(conn: RouterConnection, list: string, ip: string) {
  const rows = await rosGet<RosRecord[]>(conn, '/ip/firewall/address-list', ['.id', 'list', 'address'], { list, address: ip })
  return rows.filter((r) => r.list === list && r.address === ip && r['.id'])
}

export async function suspendIp(conn: RouterConnection, ip: string, list: string, label: string): Promise<ActionResult> {
  const existing = await listEntries(conn, list, ip)
  if (existing.length === 0) {
    await rosWrite(conn, 'PUT', '/ip/firewall/address-list', { list, address: ip, comment: `${COMMENT_PREFIX}: ${label}`.slice(0, 120) })
  }
  return { method: 'address_list', detail: `IP ${ip} agregada a la lista "${list}"` }
}

export async function reconnectIp(conn: RouterConnection, ip: string, list: string): Promise<ActionResult> {
  const existing = await listEntries(conn, list, ip)
  for (const e of existing) await rosWrite(conn, 'DELETE', `/ip/firewall/address-list/${e['.id']}`)
  return { method: 'address_list', detail: `IP ${ip} quitada de la lista "${list}"` }
}

/** ¿Hay alguna regla de firewall activa que use la lista de cortes? (solo lectura) */
export async function suspendListIsEnforced(conn: RouterConnection, list: string) {
  const [filter, nat] = await Promise.all([
    rosGet<RosRecord[]>(conn, '/ip/firewall/filter', ['src-address-list', 'dst-address-list', 'action', 'disabled']).catch(() => []),
    rosGet<RosRecord[]>(conn, '/ip/firewall/nat', ['src-address-list', 'dst-address-list', 'action', 'disabled']).catch(() => []),
  ])
  return [...filter, ...nat].some(
    (r) => !toBool(r.disabled) && (r['src-address-list'] === list || r['dst-address-list'] === list)
  )
}
