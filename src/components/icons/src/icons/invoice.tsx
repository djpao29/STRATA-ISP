import { createIcon } from "../create-icon"

/** Facturas */
export const InvoiceIcon = createIcon("InvoiceIcon", () => (
  <>
    <path d="M7 3h7.5L19 7.5V19a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" stroke="none" style={{ fill: "var(--wx-fill, currentColor)", fillOpacity: "var(--wx-fill-opacity, 0.16)" }} />
    <path d="M7 3h7.5L19 7.5V19a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--wx-line, currentColor)", strokeOpacity: "var(--wx-line-opacity, 1)" }} />
    <path d="M14.5 3v3a1.5 1.5 0 0 0 1.5 1.5h3" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--wx-line, currentColor)", strokeOpacity: "var(--wx-line-opacity, 1)" }} />
    <path d="M9 12h6" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--wx-line, currentColor)", strokeOpacity: "var(--wx-line-opacity, 1)" }} />
    <path d="M9 16h4" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--wx-line, currentColor)", strokeOpacity: "var(--wx-line-opacity, 1)" }} />
  </>
))

export default InvoiceIcon
