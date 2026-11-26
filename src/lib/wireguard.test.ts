import { createPrivateKey, createPublicKey } from 'crypto'
import { describe, expect, it } from 'vitest'
import { firstHost, generateKeyPair, isWgKey, nextFreeAddress, parseNetwork, routerScript, serverConfig } from './wireguard'

describe('claves WireGuard', () => {
  it('genera un par válido (32 bytes base64) y la pública corresponde a la privada', () => {
    const k = generateKeyPair()
    expect(isWgKey(k.publicKey)).toBe(true)
    expect(isWgKey(k.privateKey)).toBe(true)
    // Reconstruye la pública desde la privada cruda y compara.
    const pkcs8 = Buffer.concat([Buffer.from('302e020100300506032b656e04220420', 'hex'), Buffer.from(k.privateKey, 'base64')])
    const pub = createPublicKey(createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' })).export({ format: 'der', type: 'spki' }).subarray(-32)
    expect(pub.toString('base64')).toBe(k.publicKey)
  })
})

describe('red del túnel', () => {
  it('valida la red', () => {
    expect(parseNetwork('10.200.0.0/24')?.prefix).toBe(24)
    expect(parseNetwork('10.200.0.9/24')?.network).toBe('10.200.0.0/24')
    expect(parseNetwork('10.200.0.0/8')).toBeNull()
    expect(parseNetwork('300.1.1.0/24')).toBeNull()
  })
  it('asigna la primera IP libre', () => {
    expect(firstHost('10.200.0.0/24')).toBe('10.200.0.1')
    expect(nextFreeAddress('10.200.0.0/24', ['10.200.0.1', '10.200.0.2'])).toBe('10.200.0.3')
    expect(() => nextFreeAddress('10.200.0.0/29', ['10.200.0.1', '10.200.0.2', '10.200.0.3', '10.200.0.4', '10.200.0.5', '10.200.0.6'])).toThrow(/No quedan/)
  })
})

describe('scripts', () => {
  const server = { endpoint: 'vpn.miisp.com', port: 51820, network: '10.200.0.0/24', serverAddress: '10.200.0.1', publicKey: 'S'.repeat(43) + '=' }
  it('script de RouterOS repetible y restringido al servidor', () => {
    const s = routerScript(server, { name: 'LOS 15', address: '10.200.0.2', privateKey: 'R'.repeat(43) + '=' })
    expect(s).toContain('/interface wireguard remove [find name="wg-wispx"]')
    expect(s).toContain('endpoint-address=vpn.miisp.com endpoint-port=51820 allowed-address=10.200.0.1/32 persistent-keepalive=25s')
    expect(s).toContain('/ip address add address=10.200.0.2/24 interface=wg-wispx')
    expect(s).toContain('src-address=10.200.0.1 action=accept')
  })
  it('configuración del servidor con un peer por router', () => {
    const c = serverConfig({ ...server, privateKey: 'P'.repeat(43) + '=' }, [{ name: 'LOS 15', address: '10.200.0.2', publicKey: 'A'.repeat(43) + '=' }])
    expect(c).toContain('Address = 10.200.0.1/24')
    expect(c).toContain('ListenPort = 51820')
    expect(c).toContain('AllowedIPs = 10.200.0.2/32')
  })
})
