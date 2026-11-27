import { createIcon } from "../create-icon"

/** Mapa FTTH */
export const MapIcon = createIcon("MapIcon", () => (
  <>
    <path d="M9 4l6 2.5V20l-6-2.5z" stroke="none" style={{ fill: "var(--wx-fill, currentColor)", fillOpacity: "var(--wx-fill-opacity, 0.16)" }} />
    <path d="M3.5 6.5 9 4l6 2.5L20.5 4v13.5L15 20l-6-2.5-5.5 2.5z" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--wx-line, currentColor)", strokeOpacity: "var(--wx-line-opacity, 1)" }} />
    <path d="M9 4v13.5" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--wx-line, currentColor)", strokeOpacity: "var(--wx-line-opacity, 1)" }} />
    <path d="M15 6.5V20" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--wx-line, currentColor)", strokeOpacity: "var(--wx-line-opacity, 1)" }} />
  </>
))

export default MapIcon
