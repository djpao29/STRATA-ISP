/** "18.47,-69.89" → [18.47, -69.89] (o null si no es válido). */
export function parseCoordinates(value: string | null | undefined): [number, number] | null {
  const m = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(value ?? '')
  if (!m) return null
  const lat = Number(m[1])
  const lng = Number(m[2])
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lat, lng] : null
}
