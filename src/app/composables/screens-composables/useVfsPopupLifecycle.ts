import { createApp, type App as VueApp } from 'vue'
import VfsMainScreen from '@/app/screens/business-screens/VfsMainScreen.vue'
import {
  emitVfsEvent,
  requestVfsPopupClose,
  VFS_POPUP_CLOSED,
} from '@/app/composables/components-composables/useVfsMessageHooks'

const POPUP_ID = 'st-vfs-popup'
const POPUP_APP_ID = 'st-vfs-popup-app'

export function useVfsPopupLifecycle() {
  let popup: HTMLDialogElement | null = null
  let popupApp: VueApp<Element> | null = null
  let disposeInProgress = false

  const disposePopup = () => {
    if (!popup || disposeInProgress) return
    disposeInProgress = true
    if (popupApp) {
      popupApp.unmount()
      popupApp = null
    }
    popup.removeEventListener('close', onClose)
    popup.removeEventListener('cancel', onCancel)
    popup.remove()
    popup = null
    disposeInProgress = false
    emitVfsEvent(VFS_POPUP_CLOSED)
  }

  const onClose = () => {
    disposePopup()
  }

  const onCancel = (event: Event) => {
    // WHY: popup close is the only unmount path for this app; dispatch a cancelable guard before teardown.
    if (!requestVfsPopupClose()) {
      event.preventDefault()
      return
    }
    disposePopup()
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
    popup.addEventListener('close', onClose)
    popup.addEventListener('cancel', onCancel)
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
    // WHY: guard dirty editor exits before triggering dialog close/unmount.
    if (!requestVfsPopupClose()) return
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
