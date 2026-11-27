import { createIcon } from "../create-icon"

/** Dashboard de cobros */
export const TrendUpIcon = createIcon("TrendUpIcon", () => (
  <>
    <path d="M3 20v-3l6-6 4 4 8-8v13z" stroke="none" style={{ fill: "var(--wx-fill, currentColor)", fillOpacity: "var(--wx-fill-opacity, 0.16)" }} />
    <path d="M3 17l6-6 4 4 8-8" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--wx-line, currentColor)", strokeOpacity: "var(--wx-line-opacity, 1)" }} />
    <path d="M15 7h6v6" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--wx-line, currentColor)", strokeOpacity: "var(--wx-line-opacity, 1)" }} />
  </>
))

export default TrendUpIcon
