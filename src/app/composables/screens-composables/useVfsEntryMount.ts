const ENTRY_BUTTON_ID = 'st-vfs-entry-button'

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
  button.addEventListener('click', onOpen)
  host.appendChild(button)

  return () => {
    button.removeEventListener('click', onOpen)
    button.remove()
  }
}
