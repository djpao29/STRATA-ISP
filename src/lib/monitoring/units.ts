// Formato de unidades para el monitoreo (se usa en servidor y en navegador).

/** Bits por segundo → "850 Kbps", "207.9 Mbps", "1.25 Gbps". */
export function formatBps(bps: number | null | undefined): string {
  if (bps == null || !Number.isFinite(bps)) return '—'
  const units = ['bps', 'Kbps', 'Mbps', 'Gbps', 'Tbps']
  let v = Math.max(0, bps)
  let i = 0
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000
    i++
  }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`
}

/** Bytes → "512 KB", "67 MB", "1.4 GB" (base 1024, como RouterOS). */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  let v = Math.max(0, bytes)
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`
}

/** Segundos → "3d 18h 29m", "2h 3m", "45s". */
export function formatUptime(sec: number | null | undefined): string {
  if (sec == null) return '—'
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (d) return `${d}d ${h}h ${m}m`
  if (h) return `${h}h ${m}m`
  if (m) return `${m}m ${sec % 60}s`
  return `${sec}s`
}

export function percent(used: number, total: number) {
  return total > 0 ? Math.round((used / total) * 1000) / 10 : 0
}
