import { createIcon } from "../create-icon"

/** Salud de red */
export const HeartPulseIcon = createIcon("HeartPulseIcon", () => (
  <>
    <path d="M12 19.5C5.5 15.5 3.5 12.3 3.5 9.3A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 8.5 1.7c0 3-2 6.2-8.5 10.2z" stroke="none" style={{ fill: "var(--wx-fill, currentColor)", fillOpacity: "var(--wx-fill-opacity, 0.16)" }} />
    <path d="M12 19.5C5.5 15.5 3.5 12.3 3.5 9.3A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 8.5 1.7c0 3-2 6.2-8.5 10.2z" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--wx-line, currentColor)", strokeOpacity: "var(--wx-line-opacity, 1)" }} />
    <path d="M6.5 12.5h2l1.5-2.5 2.5 5 1.5-2.5h3.5" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--wx-line, currentColor)", strokeOpacity: "var(--wx-line-opacity, 1)" }} />
  </>
))

export default HeartPulseIcon
