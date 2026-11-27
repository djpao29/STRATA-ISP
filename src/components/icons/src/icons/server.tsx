import { createIcon } from "../create-icon"

/** Lista de OLT */
export const ServerIcon = createIcon("ServerIcon", () => (
  <>
    <rect x="3" y="3.5" width="18" height="7" rx="2" stroke="none" style={{ fill: "var(--wx-fill, currentColor)", fillOpacity: "var(--wx-fill-opacity, 0.16)" }} />
    <rect x="3" y="13.5" width="18" height="7" rx="2" stroke="none" style={{ fill: "var(--wx-fill, currentColor)", fillOpacity: "var(--wx-fill-opacity, 0.16)" }} />
    <rect x="3" y="3.5" width="18" height="7" rx="2" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--wx-line, currentColor)", strokeOpacity: "var(--wx-line-opacity, 1)" }} />
    <rect x="3" y="13.5" width="18" height="7" rx="2" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--wx-line, currentColor)", strokeOpacity: "var(--wx-line-opacity, 1)" }} />
    <circle cx="7" cy="7" r="1.1" stroke="none" style={{ fill: "var(--wx-line, currentColor)", fillOpacity: "var(--wx-line-opacity, 1)" }} />
    <circle cx="7" cy="17" r="1.1" stroke="none" style={{ fill: "var(--wx-line, currentColor)", fillOpacity: "var(--wx-line-opacity, 1)" }} />
    <path d="M11 7h6" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--wx-line, currentColor)", strokeOpacity: "var(--wx-line-opacity, 1)" }} />
    <path d="M11 17h6" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--wx-line, currentColor)", strokeOpacity: "var(--wx-line-opacity, 1)" }} />
  </>
))

export default ServerIcon
