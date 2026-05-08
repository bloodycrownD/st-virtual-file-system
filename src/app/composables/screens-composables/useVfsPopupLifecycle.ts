import { createApp, type App as VueApp } from 'vue'
import VfsMainScreen from '@/app/screens/business-screens/VfsMainScreen.vue'
import { emitVfsEvent, VFS_POPUP_CLOSED } from '@/app/composables/components-composables/useVfsMessageHooks'

const POPUP_ID = 'st-vfs-popup'
const POPUP_APP_ID = 'st-vfs-popup-app'

export function useVfsPopupLifecycle() {
  let popup: HTMLDialogElement | null = null
  let popupApp: VueApp<Element> | null = null

  const disposePopup = () => {
    if (!popup) return
    if (popupApp) {
      popupApp.unmount()
      popupApp = null
    }
    popup.removeEventListener('close', disposePopup)
    popup.removeEventListener('cancel', disposePopup)
    popup.remove()
    popup = null
    emitVfsEvent(VFS_POPUP_CLOSED)
  }

  const open = () => {
    if (typeof document === 'undefined') return null
    if (popup && popup.open) return popup
    if (popup) {
      disposePopup()
    }
    popup = document.createElement('dialog')
    popup.id = POPUP_ID
    popup.style.width = '80vw'
    popup.style.maxWidth = '960px'
    popup.innerHTML = `<div id="${POPUP_APP_ID}"></div>`
    popup.addEventListener('close', disposePopup)
    popup.addEventListener('cancel', disposePopup)
    document.body.appendChild(popup)
    if (typeof popup.showModal === 'function') {
      popup.showModal()
    } else {
      popup.setAttribute('open', 'true')
    }
    const appRoot = popup.querySelector(`#${POPUP_APP_ID}`)
    if (appRoot) {
      popupApp = createApp(VfsMainScreen)
      popupApp.mount(appRoot)
    }
    return popup
  }

  const close = () => {
    if (!popup) return
    if (popup.open && typeof popup.close === 'function') {
      popup.close()
      return
    }
    disposePopup()
  }

  return {
    open,
    close,
    isOpen: () => Boolean(popup),
  }
}
