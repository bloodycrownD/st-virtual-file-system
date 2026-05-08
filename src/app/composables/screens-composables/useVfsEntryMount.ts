const ENTRY_BUTTON_ID = 'st-vfs-entry-button'
const ENTRY_CLICK_NS = '.vfsEntry'

export function mountVfsEntry(onOpen: () => void): (() => void) | null {
  if (typeof document === 'undefined') return null
  const host = document.querySelector('.extraMesButtons')
  if (!host) return null

  const existing = host.querySelector<HTMLButtonElement>(`#${ENTRY_BUTTON_ID}`)
  // WHY: mount must be idempotent; repeated calls must keep a valid cleanup handle.
  const button =
    existing ??
    (() => {
      const created = document.createElement('button')
      created.id = ENTRY_BUTTON_ID
      created.type = 'button'
      created.textContent = 'VFS'
      created.className = 'menu_button'
      host.appendChild(created)
      return created
    })()
  // WHY: spec requires on/off paired lifecycle to avoid stale handlers on repeated mounts.
  const jQueryLike = (window as { jQuery?: ((el: Element) => { on: (event: string, handler: () => void) => void; off: (event: string) => void }) }).jQuery
  if (jQueryLike) {
    jQueryLike(button).off(`click${ENTRY_CLICK_NS}`)
    jQueryLike(button).on(`click${ENTRY_CLICK_NS}`, onOpen)
  } else {
    // WHY: `onclick` overwrites any previous handler, preventing duplicate refresh/open actions
    // when bootstrap re-runs without jQuery available.
    button.onclick = onOpen
  }

  return () => {
    if (jQueryLike) {
      jQueryLike(button).off(`click${ENTRY_CLICK_NS}`)
    } else {
      button.onclick = null
    }
    button.remove()
  }
}
