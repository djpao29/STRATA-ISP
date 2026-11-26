import type { Router } from '@prisma/client'
import { decrypt } from '@/lib/crypto'
import type { RouterConnection } from './client'

/** Datos de conexión de un router registrado (la contraseña se descifra solo en el servidor). */
export function connectionFor(
  router: Pick<Router, 'host' | 'port' | 'useHttps' | 'verifyTls' | 'username' | 'passwordEnc'>,
  timeoutSec = 8
): RouterConnection {
  return {
    host: router.host,
    port: router.port,
    useHttps: router.useHttps,
    verifyTls: router.verifyTls,
    username: router.username,
    password: decrypt(router.passwordEnc),
    timeoutMs: timeoutSec * 1000,
  }
}
