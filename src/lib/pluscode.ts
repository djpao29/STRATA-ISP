/**
 * Plus Codes (Open Location Code), el formato de Google Maps: "87G8Q2F4+XC" o corto "Q2F4+XC Santo Domingo".
 * Implementación del algoritmo público (precisión de 10 dígitos ≈ 14 m).
 */

const ALPHABET = '23456789CFGHJMPQRVWX'
const SEP = '+'
const PAIR_RES = [20, 1, 0.05, 0.0025, 0.000125]

function clipLat(lat: number) {
  return Math.min(90, Math.max(-90, lat))
}
function normLng(lng: number) {
  while (lng < -180) lng += 360
  while (lng >= 180) lng -= 360
  return lng
}

/** Coordenadas → código completo de 10 dígitos ("87G8Q2F4+XC"). */
export function encodePlusCode(lat: number, lng: number) {
  let la = clipLat(lat)
  if (la === 90) la -= 0.000125 / 2
  let lo = normLng(lng)
  la += 90
  lo += 180
  let code = ''
  for (let i = 0; i < 5; i++) {
    const r = PAIR_RES[i]
    const dLat = Math.floor(la / r)
    const dLng = Math.floor(lo / r)
    la -= dLat * r
    lo -= dLng * r
    code += ALPHABET[dLat] + ALPHABET[dLng]
    if (i === 3) code += SEP
  }
  return code
}

/** Código completo → centro de su área. null si no es válido. */
export function decodePlusCode(code: string): [number, number] | null {
  const c = code.trim().toUpperCase().replace(SEP, '')
  if (!/^[23456789CFGHJMPQRVWX]{10}$/.test(c)) return null
  let lat = -90
  let lng = -180
  for (let i = 0; i < 5; i++) {
    lat += ALPHABET.indexOf(c[i * 2]) * PAIR_RES[i]
    lng += ALPHABET.indexOf(c[i * 2 + 1]) * PAIR_RES[i]
  }
  return [lat + PAIR_RES[4] / 2, lng + PAIR_RES[4] / 2]
}

/**
 * Acepta un código completo ("87G8Q2F4+XC") o uno corto ("Q2F4+XC", con o sin ciudad detrás);
 * los cortos se completan con la zona más cercana al punto de referencia.
 */
export function parsePlusCode(input: string, ref: [number, number]): [number, number] | null {
  const raw = input.trim().split(/\s+/)[0]?.toUpperCase() ?? ''
  const m = /^([23456789CFGHJMPQRVWX]{2,8})\+([23456789CFGHJMPQRVWX]{2})$/.exec(raw)
  if (!m) return null
  const before = m[1]
  if (before.length === 8) return decodePlusCode(raw)
  if (before.length % 2 !== 0) return null
  const missing = 8 - before.length
  const refCode = encodePlusCode(ref[0], ref[1])
  const full = refCode.slice(0, missing) + before + SEP + m[2]
  const point = decodePlusCode(full)
  if (!point) return null
  // El área de la parte faltante; si el punto quedó a más de media área, se mueve una celda.
  const res = PAIR_RES[missing / 2 - 1]
  const half = res / 2
  let [lat, lng] = point
  if (ref[0] + half < lat && lat - res >= -90) lat -= res
  else if (ref[0] - half > lat && lat + res <= 90) lat += res
  if (ref[1] + half < lng) lng -= res
  else if (ref[1] - half > lng) lng += res
  return [lat, lng]
}
