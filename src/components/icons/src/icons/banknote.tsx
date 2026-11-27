import { createIcon } from "../create-icon"

/** Gastos */
export const BanknoteIcon = createIcon("BanknoteIcon", () => (
  <>
    <rect x="3" y="6" width="18" height="12" rx="2" stroke="none" style={{ fill: "var(--wx-fill, currentColor)", fillOpacity: "var(--wx-fill-opacity, 0.16)" }} />
    <rect x="3" y="6" width="18" height="12" rx="2" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--wx-line, currentColor)", strokeOpacity: "var(--wx-line-opacity, 1)" }} />
    <circle cx="12" cy="12" r="2.5" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--wx-line, currentColor)", strokeOpacity: "var(--wx-line-opacity, 1)" }} />
    <circle cx="6.5" cy="12" r="1" stroke="none" style={{ fill: "var(--wx-line, currentColor)", fillOpacity: "var(--wx-line-opacity, 1)" }} />
    <circle cx="17.5" cy="12" r="1" stroke="none" style={{ fill: "var(--wx-line, currentColor)", fillOpacity: "var(--wx-line-opacity, 1)" }} />
  </>
))

export default BanknoteIcon
