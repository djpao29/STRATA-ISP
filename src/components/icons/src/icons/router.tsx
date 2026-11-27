import { createIcon } from "../create-icon"

/** Router WiFi */
export const RouterIcon = createIcon("RouterIcon", () => (
  <>
    <rect x="3" y="13" width="18" height="7" rx="2" stroke="none" style={{ fill: "var(--wx-fill, currentColor)", fillOpacity: "var(--wx-fill-opacity, 0.16)" }} />
    <rect x="3" y="13" width="18" height="7" rx="2" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--wx-line, currentColor)", strokeOpacity: "var(--wx-line-opacity, 1)" }} />
    <path d="M9 9a4.24 4.24 0 0 1 6 0" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--wx-line, currentColor)", strokeOpacity: "var(--wx-line-opacity, 1)" }} />
    <path d="M6 6a8.49 8.49 0 0 1 12 0" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--wx-line, currentColor)", strokeOpacity: "var(--wx-line-opacity, 1)" }} />
    <circle cx="7" cy="16.5" r="1.2" stroke="none" style={{ fill: "var(--wx-line, currentColor)", fillOpacity: "var(--wx-line-opacity, 1)" }} />
    <path d="M11 16.5h6" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--wx-line, currentColor)", strokeOpacity: "var(--wx-line-opacity, 1)" }} />
  </>
))

export default RouterIcon
