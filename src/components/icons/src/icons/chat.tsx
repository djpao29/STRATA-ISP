import { createIcon } from "../create-icon"

/** WhatsApp */
export const ChatIcon = createIcon("ChatIcon", () => (
  <>
    <path d="M12 3.5a8.5 8.5 0 0 1 0 17c-1.4 0-2.8-.35-4-.98L3.5 20.5l1.1-4.2A8.5 8.5 0 0 1 12 3.5z" stroke="none" style={{ fill: "var(--wx-fill, currentColor)", fillOpacity: "var(--wx-fill-opacity, 0.16)" }} />
    <path d="M12 3.5a8.5 8.5 0 0 1 0 17c-1.4 0-2.8-.35-4-.98L3.5 20.5l1.1-4.2A8.5 8.5 0 0 1 12 3.5z" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--wx-line, currentColor)", strokeOpacity: "var(--wx-line-opacity, 1)" }} />
    <circle cx="8.5" cy="12" r="1.1" stroke="none" style={{ fill: "var(--wx-line, currentColor)", fillOpacity: "var(--wx-line-opacity, 1)" }} />
    <circle cx="12" cy="12" r="1.1" stroke="none" style={{ fill: "var(--wx-line, currentColor)", fillOpacity: "var(--wx-line-opacity, 1)" }} />
    <circle cx="15.5" cy="12" r="1.1" stroke="none" style={{ fill: "var(--wx-line, currentColor)", fillOpacity: "var(--wx-line-opacity, 1)" }} />
  </>
))

export default ChatIcon
