import { createIcon } from "../create-icon"

/** Red */
export const WifiIcon = createIcon("WifiIcon", () => (
  <>
    <circle cx="12" cy="18.5" r="1.4" stroke="none" style={{ fill: "var(--wx-line, currentColor)", fillOpacity: "var(--wx-line-opacity, 1)" }} />
    <path d="M9 15.5a4.24 4.24 0 0 1 6 0" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--wx-line, currentColor)", strokeOpacity: "var(--wx-line-opacity, 1)" }} />
    <path d="M6 12.5a8.49 8.49 0 0 1 12 0" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--wx-line, currentColor)", strokeOpacity: "var(--wx-line-opacity, 1)" }} />
    <path d="M3 9.5a12.73 12.73 0 0 1 18 0" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--wx-line, currentColor)", strokeOpacity: "var(--wx-line-opacity, 1)" }} />
  </>
))

export default WifiIcon
