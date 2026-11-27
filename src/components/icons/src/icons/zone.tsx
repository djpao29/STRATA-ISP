import { createIcon } from "../create-icon"

/** Zonas */
export const ZoneIcon = createIcon("ZoneIcon", () => (
  <>
    <path d="M12 3l8.5 4.5L12 12 3.5 7.5z" stroke="none" style={{ fill: "var(--wx-fill, currentColor)", fillOpacity: "var(--wx-fill-opacity, 0.16)" }} />
    <path d="M12 3l8.5 4.5L12 12 3.5 7.5z" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--wx-line, currentColor)", strokeOpacity: "var(--wx-line-opacity, 1)" }} />
    <path d="M3.5 12l8.5 4.5 8.5-4.5" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--wx-line, currentColor)", strokeOpacity: "var(--wx-line-opacity, 1)" }} />
    <path d="M3.5 16l8.5 4.5 8.5-4.5" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--wx-line, currentColor)", strokeOpacity: "var(--wx-line-opacity, 1)" }} />
  </>
))

export default ZoneIcon
