import http from 'http'
import type { AddressInfo } from 'net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { rosRequest, rosWrite, RouterOSError, type RouterConnection } from './client'
import { getInterfaces, getPppActive, getSystemInfo, monitorTraffic } from './routeros'

/**
 * Servidor de PRUEBA que responde como la API REST de RouterOS 7 según la documentación oficial
 * (todos los valores como texto, errores {error, message, detail}). Solo existe dentro de estos tests.
 */
const requests: Array<{ method: string; url: string; body: string }> = []
let slowCount = 0

const server = http.createServer((req, res) => {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    requests.push({ method: req.method ?? '', url: req.url ?? '', body })
    const auth = Buffer.from((req.headers.authorization ?? '').replace('Basic ', ''), 'base64').toString()
    const json = (status: number, data: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(data))
    }
    if (auth !== 'monitoreo:secreto') return json(401, { error: 401, message: 'Unauthorized' })

    const path = (req.url ?? '').split('?')[0]
    switch (`${req.method} ${path}`) {
      case 'GET /rest/system/resource':
        return json(200, {
          'architecture-name': 'arm64', 'board-name': 'RB5009UG+S+', 'cpu-count': '4', 'cpu-load': '7',
          'free-hdd-space': '1048576', 'total-hdd-space': '4194304', 'free-memory': '536870912', 'total-memory': '1073741824',
          uptime: '3d18h29m46s', version: '7.16.2 (stable)',
        })
      case 'GET /rest/system/identity':
        return json(200, { name: 'Core-Norte' })
      case 'GET /rest/system/routerboard':
        return json(200, { routerboard: 'true', model: 'RB5009UG+S+' })
      case 'GET /rest/system/health':
        return json(200, [{ '.id': '*D', name: 'voltage', value: '24.1', type: 'V' }, { '.id': '*E', name: 'temperature', value: '39', type: 'C' }])
      case 'GET /rest/system/resource/cpu':
        return json(200, [{ cpu: 'cpu0', load: '5' }, { cpu: 'cpu1', load: '9' }])
      case 'GET /rest/interface':
        return json(200, [
          { name: 'ether1', 'default-name': 'ether1', type: 'ether', running: 'true', disabled: 'false', 'rx-byte': '1000', 'tx-byte': '2000' },
          { name: 'sfp-sfpplus1', 'default-name': 'sfp-sfpplus1', type: 'ether', running: 'false', disabled: 'false', 'rx-byte': '0', 'tx-byte': '0' },
        ])
      case 'POST /rest/interface/monitor-traffic':
        return json(200, [{ name: 'ether1', 'rx-bits-per-second': '207900000', 'tx-bits-per-second': '12000000' }])
      case 'GET /rest/ppp/active':
        return json(500, { error: 500, message: 'Internal Server Error', detail: 'not enough permissions (9)' })
      case 'GET /rest/slow':
        slowCount++
        return setTimeout(() => json(200, {}), 2000)
      default:
        return json(404, { error: 404, message: 'Not Found' })
    }
  })
})

let conn: RouterConnection

beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const { port } = server.address() as AddressInfo
  conn = { host: '127.0.0.1', port, useHttps: false, verifyTls: false, username: 'monitoreo', password: 'secreto', timeoutMs: 3000 }
})
afterAll(() => new Promise<void>((r) => server.close(() => r())))

describe('cliente REST de RouterOS', () => {
  it('lee el estado del sistema y convierte los valores', async () => {
    const s = await getSystemInfo(conn)
    expect(s).toMatchObject({
      identity: 'Core-Norte', model: 'RB5009UG+S+', osVersion: '7.16.2 (stable)', uptimeSec: 325786,
      cpuLoad: 7, cpuCount: 4, temperature: 39, voltage: 24.1,
    })
    expect(s.memTotal - s.memFree).toBe(BigInt(536870912))
    expect(s.cpuCores).toEqual([{ name: 'cpu0', load: 5 }, { name: 'cpu1', load: 9 }])
  })

  it('pide solo los campos necesarios (.proplist)', async () => {
    const list = await getInterfaces(conn)
    expect(list.map((i) => [i.name, i.running, i.isSfp])).toEqual([['ether1', true, false], ['sfp-sfpplus1', false, true]])
    const req = requests.find((r) => r.url.startsWith('/rest/interface?'))!
    expect(decodeURIComponent(req.url)).toContain('.proplist=name,default-name,type')
  })

  it('monitor-traffic usa POST con "once" vacío, como indica la documentación', async () => {
    const t = await monitorTraffic(conn, ['ether1'])
    expect(t).toEqual([{ name: 'ether1', rxBps: 207900000, txBps: 12000000 }])
    const req = requests.find((r) => r.url === '/rest/interface/monitor-traffic')!
    expect(JSON.parse(req.body)).toMatchObject({ interface: 'ether1', once: '' })
  })

  it('una función no disponible por permisos devuelve null en vez de romper', async () => {
    expect(await getPppActive(conn)).toBeNull()
  })

  it('credenciales incorrectas → error de autenticación claro', async () => {
    const bad = { ...conn, password: 'mala' }
    await expect(getSystemInfo(bad)).rejects.toMatchObject({ kind: 'auth', status: 401 })
  })

  it('bloquea cualquier operación que no sea de lectura', async () => {
    await expect(rosRequest(conn, 'POST', '/system/reboot')).rejects.toBeInstanceOf(RouterOSError)
    await expect(rosRequest(conn, 'POST', '/ppp/active/remove')).rejects.toThrow(/solo lectura/)
    expect(requests.some((r) => r.url.includes('reboot') || r.url.includes('remove'))).toBe(false)
  })

  it('escrituras: solo la lista cerrada de cortes y reconexiones, con campos permitidos', async () => {
    const before = requests.length
    await expect(rosWrite(conn, 'DELETE', '/ppp/secret/*1')).rejects.toThrow(/no permitida/)
    await expect(rosWrite(conn, 'PATCH', '/system/identity')).rejects.toThrow(/no permitida/)
    await expect(rosWrite(conn, 'PUT', '/ip/firewall/filter', { chain: 'forward' })).rejects.toThrow(/no permitida/)
    await expect(rosWrite(conn, 'PATCH', '/ppp/secret/*1', { password: 'x' })).rejects.toThrow(/Campos no permitidos/)
    await expect(rosWrite(conn, 'PATCH', '/ppp/secret/*1', { disabled: 'yes', service: 'any' })).rejects.toThrow(/Campos no permitidos/)
    await expect(rosWrite(conn, 'DELETE', '/ppp/profile/*1')).rejects.toThrow(/no permitida/)
    await expect(rosWrite(conn, 'DELETE', '/queue/simple/*1')).rejects.toThrow(/no permitida/)
    await expect(rosWrite(conn, 'PATCH', '/ppp/profile/*1', { name: 'otro' })).rejects.toThrow(/Campos no permitidos/)
    await expect(rosWrite(conn, 'PATCH', '/queue/simple/*1', { target: '0.0.0.0/0' })).rejects.toThrow(/Campos no permitidos/)
    expect(requests.length).toBe(before) // nada llegó al router
  })

  it('tiempo de espera con un reintento', async () => {
    slowCount = 0
    await expect(rosRequest({ ...conn, timeoutMs: 300 }, 'GET', '/slow')).rejects.toMatchObject({ kind: 'timeout' })
    expect(slowCount).toBe(2) // intento + 1 reintento
  })

  it('router apagado o puerto cerrado → mensaje que indica activar el servicio', async () => {
    await expect(getSystemInfo({ ...conn, port: 1 })).rejects.toMatchObject({ kind: 'rest_unavailable' })
  })
})
