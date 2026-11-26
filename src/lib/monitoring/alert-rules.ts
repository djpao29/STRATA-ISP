// Reglas de alerta puras (sin base de datos), probadas con tests.

export type AlertSeverityLevel = 'INFO' | 'WARNING' | 'CRITICAL'

export type FiringAlert = { key: string; severity: AlertSeverityLevel; message: string; value?: string }

export type Thresholds = {
  cpuThreshold: number
  memThreshold: number
  tempThreshold: number
  latencyThreshold: number
}

export type HealthSample = {
  cpuLoad: number
  memUsedPct: number
  temperature: number | null
  latencyMs: number
}

export type InterfaceState = {
  name: string
  running: boolean
  disabled: boolean
  role: 'WAN' | 'LAN' | 'OTHER'
  isSfp: boolean
  alertOnDown: boolean
  missing: boolean
}

/** Alertas que deberían estar activas para un router que respondió. */
export function computeAlerts(sample: HealthSample, interfaces: InterfaceState[], t: Thresholds): FiringAlert[] {
  const alerts: FiringAlert[] = []

  if (sample.cpuLoad >= t.cpuThreshold) {
    alerts.push({
      key: 'cpu',
      severity: sample.cpuLoad >= 95 ? 'CRITICAL' : 'WARNING',
      message: `CPU al ${sample.cpuLoad}% (límite ${t.cpuThreshold}%)`,
      value: `${sample.cpuLoad}%`,
    })
  }
  if (sample.memUsedPct >= t.memThreshold) {
    const pct = Math.round(sample.memUsedPct)
    alerts.push({
      key: 'memory',
      severity: pct >= 97 ? 'CRITICAL' : 'WARNING',
      message: `Memoria RAM al ${pct}% (límite ${t.memThreshold}%)`,
      value: `${pct}%`,
    })
  }
  if (sample.temperature !== null && sample.temperature >= t.tempThreshold) {
    alerts.push({
      key: 'temperature',
      severity: sample.temperature >= t.tempThreshold + 10 ? 'CRITICAL' : 'WARNING',
      message: `Temperatura de ${sample.temperature} °C (límite ${t.tempThreshold} °C)`,
      value: `${sample.temperature} °C`,
    })
  }
  if (sample.latencyMs >= t.latencyThreshold) {
    alerts.push({
      key: 'latency',
      severity: 'WARNING',
      message: `Tiempo de respuesta elevado: ${sample.latencyMs} ms (límite ${t.latencyThreshold} ms)`,
      value: `${sample.latencyMs} ms`,
    })
  }

  for (const i of interfaces) {
    if (!i.alertOnDown || i.disabled) continue
    if (i.running && !i.missing) continue
    const what = i.role === 'WAN' ? 'Interfaz WAN' : i.isSfp ? 'Puerto SFP/SFP+' : 'Interfaz'
    alerts.push({
      key: `iface_down:${i.name}`,
      severity: i.role === 'WAN' ? 'CRITICAL' : 'WARNING',
      message: i.missing ? `${what} ${i.name} ya no existe en el router` : `${what} ${i.name} caída (sin enlace)`,
    })
  }

  return alerts
}

export function offlineAlert(error: string): FiringAlert {
  return { key: 'offline', severity: 'CRITICAL', message: `Sin conexión con el router: ${error}` }
}
