/** Se ejecuta una vez al arrancar el servidor. */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Falla pronto si el entorno está mal configurado.
    const { env } = await import('@/lib/env')
    env()
    // Recolector de monitoreo de los MikroTik.
    const { startMonitoring } = await import('@/lib/monitoring/scheduler')
    startMonitoring()
    // Facturación por zonas, cortes y reconexiones automáticas.
    const { startJobs } = await import('@/lib/jobs/scheduler')
    startJobs()
  }
}
