import net from 'net'
import { Client as SshClient } from 'ssh2'

/**
 * Consola de la OLT por Telnet o SSH: inicia sesión, ejecuta comandos uno por uno esperando el
 * prompt, responde a la paginación ("---- More") y devuelve todo lo impreso.
 */
export type CliTarget = {
  protocol: 'TELNET' | 'SSH'
  host: string
  port: number
  username: string
  password: string
  enablePassword?: string | null
  timeoutMs?: number
}

export class CliError extends Error {
  constructor(
    message: string,
    public output = ''
  ) {
    super(message)
  }
}

const PROMPT = /(^|[\r\n])[^\r\n]{0,80}[>#]\s*$/
const LOGIN = /(user ?name|login)\s*:\s*$/i
const PASSWORD = /password\s*:\s*$/i
const MORE = /(-{2,}\s*more[^\r\n]*$|--more--\s*$|press any key[^\r\n]*$)/i
// Huawei pregunta parámetros opcionales con "{ <cr>|... }:" → Enter acepta.
const HUAWEI_CR = /\{\s*<cr>[^}]*\}\s*:\s*$/i
const CONFIRM = /\(y\/n\)\s*\[?[yn]?\]?\s*:?\s*$/i
const ERROR_LINE = /(^|\n)\s*(%?\s*(error|failure|failed|invalid|unknown command|unrecognized command|incomplete command)[^\n]*)/i

type Transport = { write: (s: string) => void; onData: (cb: (s: string) => void) => void; close: () => void }

/** Elimina negociación Telnet (IAC) y responde que no a todo. */
function telnetTransport(t: CliTarget): Promise<Transport> {
  return new Promise((resolve, reject) => {
    const sock = net.connect({ host: t.host, port: t.port })
    const listeners: Array<(s: string) => void> = []
    const timer = setTimeout(() => {
      sock.destroy()
      reject(new CliError(`La OLT ${t.host}:${t.port} no respondió por Telnet.`))
    }, t.timeoutMs ?? 10000)
    sock.on('connect', () => {
      clearTimeout(timer)
      resolve({ write: (s) => sock.write(s), onData: (cb) => listeners.push(cb), close: () => sock.destroy() })
    })
    sock.on('error', (e: NodeJS.ErrnoException) => {
      clearTimeout(timer)
      reject(new CliError(e.code === 'ECONNREFUSED' ? `Conexión rechazada en ${t.host}:${t.port} (¿Telnet habilitado?).` : `Telnet ${t.host}: ${e.message}`))
    })
    sock.on('data', (buf: Buffer) => {
      const out: number[] = []
      for (let i = 0; i < buf.length; i++) {
        if (buf[i] === 255 && i + 1 < buf.length) {
          const cmd = buf[i + 1]
          if ((cmd === 251 || cmd === 252 || cmd === 253 || cmd === 254) && i + 2 < buf.length) {
            const opt = buf[i + 2]
            // WILL/WONT → DONT ; DO/DONT → WONT (salvo eco y supresión de go-ahead, que se aceptan)
            if (cmd === 251) sock.write(Buffer.from([255, opt === 1 || opt === 3 ? 253 : 254, opt]))
            if (cmd === 253) sock.write(Buffer.from([255, opt === 3 ? 251 : 252, opt]))
            i += 2
            continue
          }
          if (cmd === 250) {
            while (i < buf.length && !(buf[i] === 255 && buf[i + 1] === 240)) i++
            i++
            continue
          }
          i++
          continue
        }
        out.push(buf[i])
      }
      if (out.length) {
        const s = Buffer.from(out).toString('latin1')
        listeners.forEach((l) => l(s))
      }
    })
  })
}

function sshTransport(t: CliTarget): Promise<Transport> {
  return new Promise((resolve, reject) => {
    const c = new SshClient()
    c.on('ready', () => {
      c.shell({ term: 'vt100', cols: 200, rows: 1000 }, (err, stream) => {
        if (err) return reject(new CliError(`SSH ${t.host}: ${err.message}`))
        const listeners: Array<(s: string) => void> = []
        stream.on('data', (d: Buffer) => listeners.forEach((l) => l(d.toString('latin1'))))
        resolve({ write: (s) => stream.write(s), onData: (cb) => listeners.push(cb), close: () => c.end() })
      })
    })
    c.on('error', (e) => reject(new CliError(`SSH ${t.host}: ${e.message}`)))
    c.connect({
      host: t.host,
      port: t.port,
      username: t.username,
      password: t.password,
      readyTimeout: t.timeoutMs ?? 10000,
      // Las OLT suelen usar algoritmos antiguos.
      algorithms: { kex: ['diffie-hellman-group14-sha1', 'diffie-hellman-group1-sha1', 'ecdh-sha2-nistp256', 'diffie-hellman-group-exchange-sha256', 'curve25519-sha256'] },
    })
  })
}

/** Ejecuta comandos en la OLT. Lanza CliError si la OLT responde con un error. */
export async function runCli(t: CliTarget, commands: string[], opts: { stopOnError?: boolean } = {}) {
  const stopOnError = opts.stopOnError ?? true
  const tr = t.protocol === 'SSH' ? await sshTransport(t) : await telnetTransport(t)
  let buffer = ''
  let all = ''
  let waiter: (() => void) | null = null
  tr.onData((s) => {
    buffer += s
    all += s
    if (MORE.test(buffer)) {
      buffer = buffer.replace(MORE, '')
      tr.write(' ')
      return
    }
    if (HUAWEI_CR.test(buffer)) {
      buffer = ''
      tr.write('\r\n')
      return
    }
    if (CONFIRM.test(buffer)) {
      buffer = ''
      tr.write('y\r\n')
      return
    }
    waiter?.()
  })
  const timeoutMs = t.timeoutMs ?? 15000
  const waitFor = (re: RegExp, what: string) =>
    new Promise<void>((resolve, reject) => {
      const check = () => {
        if (re.test(buffer)) {
          waiter = null
          clearTimeout(timer)
          resolve()
        }
      }
      const timer = setTimeout(() => {
        waiter = null
        reject(new CliError(`La OLT no respondió (${what}).`, all))
      }, timeoutMs)
      waiter = check
      check()
    })

  try {
    if (t.protocol === 'TELNET') {
      await waitFor(new RegExp(`${LOGIN.source}|${PROMPT.source}`, 'i'), 'pedido de usuario')
      if (LOGIN.test(buffer)) {
        buffer = ''
        tr.write(`${t.username}\r\n`)
        await waitFor(PASSWORD, 'pedido de clave')
        buffer = ''
        tr.write(`${t.password}\r\n`)
      }
    }
    await waitFor(new RegExp(`${PROMPT.source}|${LOGIN.source}|${PASSWORD.source}`, 'i'), 'inicio de sesión')
    if (LOGIN.test(buffer) || PASSWORD.test(buffer)) {
      // Lo que respondió la OLT (la clave no se repite en pantalla), para saber por qué rechazó el acceso.
      const said = buffer
        .replace(/[^\x20-\x7e\r\n]/g, '')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(-3)
        .join(' | ')
      throw new CliError(`Usuario o clave de consola incorrectos${said ? ` (la OLT respondió: «${said.slice(0, 160)}»)` : ''}.`, all)
    }

    const outputs: string[] = []
    for (const raw of commands) {
      const cmd = raw.trimEnd()
      if (!cmd) continue
      buffer = ''
      tr.write(`${cmd}\r\n`)
      if (cmd === 'enable' && t.enablePassword) {
        await waitFor(new RegExp(`${PASSWORD.source}|${PROMPT.source}`, 'i'), 'enable')
        if (PASSWORD.test(buffer)) {
          buffer = ''
          tr.write(`${t.enablePassword}\r\n`)
        }
      }
      await waitFor(PROMPT, `comando "${cmd}"`)
      const out = buffer
      outputs.push(out)
      const err = ERROR_LINE.exec(out.replace(cmd, ''))
      if (err && stopOnError) throw new CliError(`La OLT rechazó "${cmd}": ${err[2].trim()}`, all)
    }
    return { outputs, all }
  } finally {
    tr.close()
  }
}
