import { createIcon } from "../create-icon"

/** Routers */
export const SwitchIcon = createIcon("SwitchIcon", () => (
  <>
    <rect x="3" y="9" width="18" height="9" rx="2" stroke="none" style={{ fill: "var(--wx-fill, currentColor)", fillOpacity: "var(--wx-fill-opacity, 0.16)" }} />
    <rect x="3" y="9" width="18" height="9" rx="2" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--wx-line, currentColor)", strokeOpacity: "var(--wx-line-opacity, 1)" }} />
    <path d="M7 9V5" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--wx-line, currentColor)", strokeOpacity: "var(--wx-line-opacity, 1)" }} />
    <path d="M17 9V5" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--wx-line, currentColor)", strokeOpacity: "var(--wx-line-opacity, 1)" }} />
    <circle cx="7" cy="13.5" r="1.1" stroke="none" style={{ fill: "var(--wx-line, currentColor)", fillOpacity: "var(--wx-line-opacity, 1)" }} />
    <circle cx="10.5" cy="13.5" r="1.1" stroke="none" style={{ fill: "var(--wx-line, currentColor)", fillOpacity: "var(--wx-line-opacity, 1)" }} />
    <path d="M14 13.5h3" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--wx-line, currentColor)", strokeOpacity: "var(--wx-line-opacity, 1)" }} />
  </>
))

export default SwitchIcon
