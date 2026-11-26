/** Se ejecuta una vez al arrancar el servidor: falla pronto si el entorno está mal configurado. */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { env } = await import('@/lib/env')
    env()
  }
}
