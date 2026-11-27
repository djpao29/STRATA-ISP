import { createIcon } from "../create-icon"

/** Alertas */
export const AlertTriangleIcon = createIcon("AlertTriangleIcon", () => (
  <>
    <path d="M10.27 4.5a2 2 0 0 1 3.46 0l7 12.2a2 2 0 0 1-1.73 3H5a2 2 0 0 1-1.73-3z" stroke="none" style={{ fill: "var(--wx-fill, currentColor)", fillOpacity: "var(--wx-fill-opacity, 0.16)" }} />
    <path d="M10.27 4.5a2 2 0 0 1 3.46 0l7 12.2a2 2 0 0 1-1.73 3H5a2 2 0 0 1-1.73-3z" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--wx-line, currentColor)", strokeOpacity: "var(--wx-line-opacity, 1)" }} />
    <path d="M12 9.5v3.5" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--wx-line, currentColor)", strokeOpacity: "var(--wx-line-opacity, 1)" }} />
    <circle cx="12" cy="16.3" r="1.1" stroke="none" style={{ fill: "var(--wx-line, currentColor)", fillOpacity: "var(--wx-line-opacity, 1)" }} />
  </>
))

export default AlertTriangleIcon
