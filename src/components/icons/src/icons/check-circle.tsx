import { createIcon } from "../create-icon"

/** Autorizadas */
export const CheckCircleIcon = createIcon("CheckCircleIcon", () => (
  <>
    <circle cx="12" cy="12" r="9" stroke="none" style={{ fill: "var(--wx-fill, currentColor)", fillOpacity: "var(--wx-fill-opacity, 0.16)" }} />
    <circle cx="12" cy="12" r="9" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--wx-line, currentColor)", strokeOpacity: "var(--wx-line-opacity, 1)" }} />
    <path d="M8.5 12.2l2.5 2.5 4.5-4.7" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--wx-line, currentColor)", strokeOpacity: "var(--wx-line-opacity, 1)" }} />
  </>
))

export default CheckCircleIcon
