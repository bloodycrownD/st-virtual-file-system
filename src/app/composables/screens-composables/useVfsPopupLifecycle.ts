const POPUP_ID = 'st-vfs-popup'

export function useVfsPopupLifecycle() {
  let popup: HTMLDialogElement | null = null

  const open = () => {
    if (typeof document === 'undefined') return null
    if (popup) return popup
    popup = document.createElement('dialog')
    popup.id = POPUP_ID
    popup.style.width = '80vw'
    popup.style.maxWidth = '960px'
    popup.innerHTML = '<div id="st-vfs-popup-app"></div>'
    document.body.appendChild(popup)
    popup.showModal()
    return popup
  }

  const close = () => {
    if (!popup) return
    popup.close()
    popup.remove()
    popup = null
  }

  return {
    open,
    close,
    isOpen: () => Boolean(popup),
  }
}
