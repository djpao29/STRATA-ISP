import http from 'http'
import https from 'https'

/**
 * Cliente de la API REST de RouterOS 7 (https://help.mikrotik.com/docs/display/ROS/REST+API).
 *
 * - Solo se usa desde el servidor: las credenciales nunca llegan al navegador.
 * - Solo LECTURA: GET y los comandos de monitoreo permitidos por POST. Cualquier otra
 *   operación se rechaza aquí, antes de llegar al router.
 * - RouterOS atiende las peticiones de un mismo usuario de una en una, así que se ponen en
 *   cola por router para no provocar errores "Session closed".
 */

export type RouterConnection = {
  host: string
  port: number
  useHttps: boolean
  verifyTls: boolean
  username: string
  password: string
  timeoutMs?: number
}

export type RouterOSErrorKind =
  | 'network'
  | 'timeout'
  | 'tls'
  | 'auth'
  | 'permission'
  | 'rest_unavailable'
  | 'not_found'
  | 'bad_request'
  | 'protocol'

export class RouterOSError extends Error {
  constructor(
    message: string,
    public kind: RouterOSErrorKind,
    public status?: number
  ) {
    super(message)
    this.name = 'RouterOSError'
  }
}

/** Comandos POST permitidos: solo lectura de estado, nunca cambios de configuración. */
const READ_ONLY_POST = new Set(['/interface/monitor-traffic'])

const queues = new Map<string, Promise<unknown>>()

/** Ejecuta las peticiones a un mismo router de una en una. */
function enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve()
  const run = previous.catch(() => undefined).then(task)
  queues.set(key, run)
  run.finally(() => {
    if (queues.get(key) === run) queues.delete(key)
  }).catch(() => undefined)
  return run
}

function describeNetworkError(err: NodeJS.ErrnoException, conn: RouterConnection): RouterOSError {
  const where = `${conn.host}:${conn.port}`
  switch (err.code) {
    case 'ECONNREFUSED':
      return new RouterOSError(
        `Conexión rechazada en ${where}. Activa el servicio ${conn.useHttps ? 'www-ssl' : 'www'} en el MikroTik (IP > Services) y revisa el puerto.`,
        'rest_unavailable'
      )
    case 'EHOSTUNREACH':
    case 'ENETUNREACH':
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return new RouterOSError(`No se puede llegar a ${conn.host} (${err.code}).`, 'network')
    case 'ECONNRESET':
    case 'EPIPE':
      return new RouterOSError(`El router cerró la conexión (${err.code}).`, 'network')
    case 'EPROTO':
    case 'ERR_SSL_WRONG_VERSION_NUMBER':
    case 'ERR_SSL_SSLV3_ALERT_HANDSHAKE_FAILURE':
      return new RouterOSError(
        `No se pudo establecer HTTPS con ${where}. Lo más común: el servicio www-ssl no tiene un certificado asignado (IP > Services > www-ssl > Certificate), o ese puerto es HTTP.`,
        'tls'
      )
    case 'DEPTH_ZERO_SELF_SIGNED_CERT':
    case 'SELF_SIGNED_CERT_IN_CHAIN':
    case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
    case 'CERT_HAS_EXPIRED':
    case 'ERR_TLS_CERT_ALTNAME_INVALID':
      return new RouterOSError(
        `El certificado del router no es de confianza (${err.code}). Instala uno válido o desactiva "Validar certificado" si el router está en tu red privada.`,
        'tls'
      )
    default:
      return new RouterOSError(`Error de red con ${where}: ${err.code ?? err.message}`, 'network')
  }
}

function describeHttpError(status: number, body: string): RouterOSError {
  let detail = ''
  try {
    const json = JSON.parse(body) as { message?: string; detail?: string }
    detail = [json.message, json.detail].filter(Boolean).join(': ')
  } catch {
    /* respuesta HTML u otra */
  }
  if (status === 401)
    return new RouterOSError(
      'Usuario o contraseña rechazados, o el grupo del usuario no tiene las políticas "api" y "rest-api".',
      'auth',
      status
    )
  if (status === 403)
    return new RouterOSError('La API REST está desactivada para este protocolo en el router.', 'rest_unavailable', status)
  if (status === 404)
    return new RouterOSError(
      detail || 'Ruta no encontrada. La API REST requiere RouterOS 7.1 o superior.',
      'not_found',
      status
    )
  if (status === 500 && /not enough permissions|not allowed/i.test(detail))
    return new RouterOSError(`Permisos insuficientes en el router (${detail}). El grupo necesita "read,api,rest-api".`, 'permission', status)
  if (status === 400) return new RouterOSError(detail || 'Petición rechazada por el router.', 'bad_request', status)
  return new RouterOSError(`El router respondió ${status}${detail ? `: ${detail}` : ''}`, 'protocol', status)
}

function rawRequest(
  conn: RouterConnection,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  query?: Record<string, string>,
  body?: unknown
): Promise<unknown> {
  const qs = query && Object.keys(query).length ? `?${new URLSearchParams(query).toString()}` : ''
  const payload = body === undefined ? undefined : JSON.stringify(body)
  const lib = conn.useHttps ? https : http
  const timeoutMs = conn.timeoutMs ?? 8000

  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        host: conn.host,
        port: conn.port,
        method,
        path: `/rest${path}${qs}`,
        auth: `${conn.username}:${conn.password}`,
        headers: {
          Accept: 'application/json',
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
        ...(conn.useHttps ? { rejectUnauthorized: conn.verifyTls } : {}),
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          const status = res.statusCode ?? 0
          if (status >= 400) return reject(describeHttpError(status, text))
          if (!text) return resolve(null)
          try {
            resolve(JSON.parse(text))
          } catch {
            reject(new RouterOSError('Respuesta no válida del router (no es JSON). ¿Es un MikroTik con RouterOS 7?', 'protocol', status))
          }
        })
      }
    )
    req.on('timeout', () => {
      req.destroy()
      reject(new RouterOSError(`El router no respondió en ${Math.round(timeoutMs / 1000)} s.`, 'timeout'))
    })
    req.on('error', (err: NodeJS.ErrnoException) => {
      if (err instanceof RouterOSError) return reject(err)
      reject(describeNetworkError(err, conn))
    })
    if (payload) req.write(payload)
    req.end()
  })
}

const RETRYABLE: RouterOSErrorKind[] = ['network', 'timeout']

/**
 * Petición de solo lectura con reintento (una vez, ante fallos de red o tiempo de espera).
 */
export async function rosRequest<T = unknown>(
  conn: RouterConnection,
  method: 'GET' | 'POST',
  path: string,
  options: { query?: Record<string, string>; body?: unknown; retries?: number } = {}
): Promise<T> {
  if (method === 'POST' && !READ_ONLY_POST.has(path)) {
    throw new RouterOSError(`Operación no permitida (solo lectura): POST ${path}`, 'bad_request')
  }
  const key = `${conn.host}:${conn.port}:${conn.username}`
  const retries = options.retries ?? 1
  return enqueue(key, async () => {
    for (let attempt = 0; ; attempt++) {
      try {
        return (await rawRequest(conn, method, path, options.query, options.body)) as T
      } catch (error) {
        const retry = error instanceof RouterOSError && RETRYABLE.includes(error.kind) && attempt < retries
        if (!retry) throw error
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
      }
    }
  })
}

/**
 * ESCRITURAS permitidas: cortes y reconexiones de clientes, y velocidad de los planes
 * (perfiles PPP y colas simples). Lista cerrada: cualquier otra ruta, método o campo se
 * rechaza aquí, antes de llegar al router. Nada de esto borra perfiles ni colas.
 */
const ID = String.raw`\*[0-9A-Fa-f]+`
const QUEUE_FIELDS = ['max-limit', 'priority', 'burst-limit', 'burst-threshold', 'burst-time']
const WRITE_RULES: Array<{ method: 'PUT' | 'PATCH' | 'DELETE'; path: RegExp; fields?: string[] }> = [
  // Habilitar / deshabilitar el usuario PPP del cliente, o asignarle el perfil de su plan.
  { method: 'PATCH', path: new RegExp(`^/ppp/secret/${ID}$`), fields: ['disabled', 'profile'] },
  // Perfiles PPP de los planes PPPoE: crear o ajustar la velocidad.
  { method: 'PUT', path: /^\/ppp\/profile$/, fields: ['name', 'rate-limit', 'comment'] },
  { method: 'PATCH', path: new RegExp(`^/ppp/profile/${ID}$`), fields: ['rate-limit'] },
  // Colas simples de clientes de planes Simple Queue: crear o ajustar.
  { method: 'PUT', path: /^\/queue\/simple$/, fields: ['name', 'target', 'comment', ...QUEUE_FIELDS] },
  { method: 'PATCH', path: new RegExp(`^/queue/simple/${ID}$`), fields: QUEUE_FIELDS },
  // Cerrar la sesión PPP activa (para que el corte sea inmediato).
  { method: 'DELETE', path: new RegExp(`^/ppp/active/${ID}$`) },
  // Agregar / quitar la IP del cliente de la lista de cortes.
  { method: 'PUT', path: /^\/ip\/firewall\/address-list$/, fields: ['list', 'address', 'comment'] },
  { method: 'DELETE', path: new RegExp(`^/ip/firewall/address-list/${ID}$`) },
]

export async function rosWrite<T = unknown>(
  conn: RouterConnection,
  method: 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: Record<string, string>
): Promise<T> {
  const rule = WRITE_RULES.find((r) => r.method === method && r.path.test(path))
  if (!rule) throw new RouterOSError(`Operación no permitida: ${method} ${path}`, 'bad_request')
  const extra = Object.keys(body ?? {}).filter((k) => !rule.fields?.includes(k))
  if (extra.length) throw new RouterOSError(`Campos no permitidos en ${method} ${path}: ${extra.join(', ')}`, 'bad_request')

  const key = `${conn.host}:${conn.port}:${conn.username}`
  // Sin reintento automático aquí: la cola de acciones decide cuándo reintentar.
  return enqueue(key, async () => (await rawRequest(conn, method, path, undefined, body)) as T)
}

export function rosGet<T = unknown>(conn: RouterConnection, path: string, proplist?: string[], filters?: Record<string, string>) {
  return rosRequest<T>(conn, 'GET', path, {
    query: { ...(filters ?? {}), ...(proplist ? { '.proplist': proplist.join(',') } : {}) },
  })
}

/** Igual que rosGet, pero devuelve null si el menú no existe en este equipo (404, falta de paquete, etc.). */
export async function rosGetOptional<T = unknown>(conn: RouterConnection, path: string, proplist?: string[]) {
  try {
    return await rosGet<T>(conn, path, proplist)
  } catch (error) {
    if (error instanceof RouterOSError && ['not_found', 'bad_request', 'permission', 'protocol'].includes(error.kind)) return null
    throw error
  }
}
