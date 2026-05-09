const ENTRY_BUTTON_ID = 'st-vfs-entry-button'
const ENTRY_CLICK_NS = '.vfsEntry'
let vanillaDelegatedHandler: ((event: Event) => void) | null = null

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
      // WHY: match SillyTavern's extraMesButtons icon button spec (avoid large text button).
      created.className = 'mes_button st-vfs-entry'
      created.title = '虚拟文件系统'
      created.setAttribute('aria-label', '虚拟文件系统')
      created.innerHTML = `<i class="fa-solid fa-folder-tree" aria-hidden="true"></i>`
      host.appendChild(created)
      return created
    })()
  // Ensure an older button (from previous versions) gets normalized to the icon form.
  button.className = 'mes_button st-vfs-entry'
  button.title = '虚拟文件系统'
  button.setAttribute('aria-label', '虚拟文件系统')
  if (!button.querySelector('.fa-folder-tree')) {
    button.innerHTML = `<i class="fa-solid fa-folder-tree" aria-hidden="true"></i>`
  }

  // WHY: host may re-render/replace `.extraMesButtons`; use event delegation to keep click working.
  const jQueryLike = (window as { jQuery?: (el: unknown) => { on: (event: string, selector: string, handler: (e: unknown) => void) => void; off: (event: string, selector?: string) => void } }).jQuery
  const selector = `#${ENTRY_BUTTON_ID}`
  const clickEvent = `click${ENTRY_CLICK_NS}`
  const delegatedHandler = (event: Event) => {
    const target = (event.target as Element | null)?.closest(selector)
    if (!target) return
    event.preventDefault()
    onOpen()
  }

  if (jQueryLike) {
    jQueryLike(document).off(clickEvent, selector)
    jQueryLike(document).on(clickEvent, selector, (e: unknown) => {
      // WHY: keep click behavior consistent regardless of jQuery presence.
      ;(e as { preventDefault?: () => void } | null)?.preventDefault?.()
      onOpen()
    })
  } else {
    // WHY: remove previous delegated handler if mount is re-run.
    if (vanillaDelegatedHandler) {
      document.removeEventListener('click', vanillaDelegatedHandler)
    }
    vanillaDelegatedHandler = delegatedHandler
    document.addEventListener('click', delegatedHandler)
  }

  return () => {
    if (jQueryLike) {
      jQueryLike(document).off(clickEvent, selector)
    } else {
      document.removeEventListener('click', delegatedHandler)
      if (vanillaDelegatedHandler === delegatedHandler) vanillaDelegatedHandler = null
    }
    button.remove()
  }
}
