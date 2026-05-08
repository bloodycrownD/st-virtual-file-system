const ENTRY_BUTTON_ID = 'st-vfs-entry-button'
const ENTRY_CLICK_NS = '.vfsEntry'

export function mountVfsEntry(onOpen: () => void): (() => void) | null {
  if (typeof document === 'undefined') return null
  const host = document.querySelector('.extraMesButtons')
  if (!host) return null

  const existing = host.querySelector<HTMLButtonElement>(`#${ENTRY_BUTTON_ID}`)
  if (existing) {
    return null
  }

  const button = document.createElement('button')
  button.id = ENTRY_BUTTON_ID
  button.type = 'button'
  button.textContent = 'VFS'
  button.className = 'menu_button'
  // WHY: spec requires on/off paired lifecycle to avoid stale handlers on repeated mounts.
  const jQueryLike = (window as { jQuery?: ((el: Element) => { on: (event: string, handler: () => void) => void; off: (event: string) => void }) }).jQuery
  if (jQueryLike) {
    jQueryLike(button).off(`click${ENTRY_CLICK_NS}`)
    jQueryLike(button).on(`click${ENTRY_CLICK_NS}`, onOpen)
  } else {
    button.addEventListener('click', onOpen)
  }
  host.appendChild(button)

  return () => {
    if (jQueryLike) {
      jQueryLike(button).off(`click${ENTRY_CLICK_NS}`)
    } else {
      button.removeEventListener('click', onOpen)
    }
    button.remove()
  }
}
