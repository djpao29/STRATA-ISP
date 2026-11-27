import { createIcon } from "../create-icon"

/** Notificaciones */
export const BellIcon = createIcon("BellIcon", () => (
  <>
    <path d="M6 16V10a6 6 0 0 1 12 0v6l1.5 2.5h-15z" stroke="none" style={{ fill: "var(--wx-fill, currentColor)", fillOpacity: "var(--wx-fill-opacity, 0.16)" }} />
    <path d="M6 16V10a6 6 0 0 1 12 0v6l1.5 2.5h-15z" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--wx-line, currentColor)", strokeOpacity: "var(--wx-line-opacity, 1)" }} />
    <path d="M10 21h4" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--wx-line, currentColor)", strokeOpacity: "var(--wx-line-opacity, 1)" }} />
  </>
))

export default BellIcon
