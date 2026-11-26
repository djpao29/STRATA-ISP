import { Socket } from 'net'

/** Intenta abrir una conexión TCP. Sirve para saber si la API del equipo responde. */
export function tcpCheck(host: string, port: number, timeoutMs = 5000): Promise<{ ok: boolean; ms: number; error?: string }> {
  return new Promise((resolve) => {
    const started = Date.now()
    const socket = new Socket()
    const done = (ok: boolean, error?: string) => {
      socket.destroy()
      resolve({ ok, ms: Date.now() - started, error })
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false, 'Tiempo de espera agotado'))
    socket.once('error', (err: NodeJS.ErrnoException) => done(false, err.code ?? err.message))
    socket.connect(port, host)
  })
}

/** Host válido: IPv4 o nombre DNS. */
export const HOST_REGEX =
  /^((25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}|([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)$/
