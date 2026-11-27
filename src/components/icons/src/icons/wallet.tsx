import { createIcon } from "../create-icon"

/** Finanzas */
export const WalletIcon = createIcon("WalletIcon", () => (
  <>
    <rect x="3" y="7" width="18" height="13" rx="2.5" stroke="none" style={{ fill: "var(--wx-fill, currentColor)", fillOpacity: "var(--wx-fill-opacity, 0.16)" }} />
    <path d="M5 7V5.5A1.5 1.5 0 0 1 6.5 4H16" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--wx-line, currentColor)", strokeOpacity: "var(--wx-line-opacity, 1)" }} />
    <rect x="3" y="7" width="18" height="13" rx="2.5" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--wx-line, currentColor)", strokeOpacity: "var(--wx-line-opacity, 1)" }} />
    <path d="M21 11.5h-4a2 2 0 0 0 0 4h4" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--wx-line, currentColor)", strokeOpacity: "var(--wx-line-opacity, 1)" }} />
    <circle cx="17" cy="13.5" r="1" stroke="none" style={{ fill: "var(--wx-line, currentColor)", fillOpacity: "var(--wx-line-opacity, 1)" }} />
  </>
))

export default WalletIcon
