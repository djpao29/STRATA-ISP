import { createIcon } from "../create-icon"

/** Planes de velocidad */
export const GaugeIcon = createIcon("GaugeIcon", () => (
  <>
    <path d="M4.5 18a8.5 8.5 0 1 1 15 0z" stroke="none" style={{ fill: "var(--wx-fill, currentColor)", fillOpacity: "var(--wx-fill-opacity, 0.16)" }} />
    <path d="M4.5 18a8.5 8.5 0 1 1 15 0" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--wx-line, currentColor)", strokeOpacity: "var(--wx-line-opacity, 1)" }} />
    <path d="M12 14l3.5-3.5" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--wx-line, currentColor)", strokeOpacity: "var(--wx-line-opacity, 1)" }} />
    <circle cx="12" cy="14" r="1.6" stroke="none" style={{ fill: "var(--wx-line, currentColor)", fillOpacity: "var(--wx-line-opacity, 1)" }} />
  </>
))

export default GaugeIcon
