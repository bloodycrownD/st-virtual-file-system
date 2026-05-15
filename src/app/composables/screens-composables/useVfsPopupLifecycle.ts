import { createApp, type App as VueApp } from 'vue'
import {
  emitVfsEvent,
  requestVfsPopupClose,
  VFS_POPUP_CLOSED,
} from '@/app/composables/components-composables/useVfsMessageHooks'
import { exitFullscreenIfContainedBy } from '@/app/composables/screens-composables/useVfsPreviewFullscreen'
import VfsMainScreen from '@/app/screens/business-screens/VfsMainScreen.vue'

const POPUP_ID = 'st-vfs-popup'
const POPUP_APP_ID = 'st-vfs-popup-app'
/** Dedicated Teleport target for row `entity-actions` dropdown panels (outside scrollports). */
const POPUP_ACTION_MENU_TELEPORT_ID = 'st-vfs-action-menu-teleport'
const POPUP_CLASS = 'st-vfs-popup'
type VfsPopupScope = 'chat' | 'template'
interface VfsPopupOpenOptions {
  scope?: VfsPopupScope
  title?: string
}

export function useVfsPopupLifecycle() {
  let popup: HTMLDialogElement | null = null
  let popupApp: VueApp<Element> | null = null
  let disposeInProgress = false
  let closeButtonHandler: (() => void) | null = null

  const disposePopup = () => {
    if (!popup || disposeInProgress) return
    disposeInProgress = true
    if (popupApp) {
      // WHY: element fullscreen can outlive Vue teardown; exit before unmount so the host dialog is not stuck behind a blank layer.
      exitFullscreenIfContainedBy(popup)
      popupApp.unmount()
      popupApp = null
    }
    if (closeButtonHandler) {
      const btn = popup.querySelector<HTMLButtonElement>('[data-st-vfs-close]')
      btn?.removeEventListener('click', closeButtonHandler)
      closeButtonHandler = null
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

  const open = (options?: VfsPopupOpenOptions) => {
    if (typeof document === 'undefined') return null
    if (popup && popup.open) return popup
    if (popup) {
      disposePopup()
    }
    popup = document.createElement('dialog')
    popup.id = POPUP_ID
    popup.classList.add(POPUP_CLASS)
    popup.setAttribute('role', 'dialog')
    popup.style.width = 'min(960px, 96vw)'
    popup.style.maxWidth = '100vw'
    if (options?.title) {
      popup.setAttribute('aria-label', options.title)
    }
    // WHY: avoid `innerHTML` here — host themes/plugins may rewrite dialog contents. Build DOM nodes explicitly.
    popup.replaceChildren()
    const header = document.createElement('header')
    header.className = 'st-vfs-popup__header'
    const title = document.createElement('div')
    title.className = 'st-vfs-popup__title'
    title.textContent = options?.title ?? '虚拟文件系统'
    const headerActions = document.createElement('div')
    headerActions.className = 'st-vfs-popup__header-actions'
    const closeButton = document.createElement('button')
    closeButton.type = 'button'
    closeButton.className = 'menu_button st-vfs-popup__close'
    closeButton.setAttribute('data-st-vfs-close', 'true')
    closeButton.setAttribute('aria-label', '关闭')
    closeButton.title = '关闭'
    closeButton.textContent = '×'
    headerActions.append(closeButton)
    header.append(title, headerActions)
    const appRoot = document.createElement('div')
    appRoot.id = POPUP_APP_ID
    appRoot.className = 'st-vfs-popup__app'
    const actionMenuTeleportHost = document.createElement('div')
    actionMenuTeleportHost.id = POPUP_ACTION_MENU_TELEPORT_ID
    actionMenuTeleportHost.className = 'st-vfs-popup__action-menu-teleport'
    popup.append(header, appRoot, actionMenuTeleportHost)
    popup.addEventListener('close', onClose)
    popup.addEventListener('cancel', onCancel)
    document.body.appendChild(popup)
    if (typeof popup.showModal === 'function') {
      popup.showModal()
    } else {
      popup.setAttribute('open', 'true')
    }
    closeButtonHandler = () => close()
    closeButton.addEventListener('click', closeButtonHandler)

    try {
      popupApp = createApp(VfsMainScreen, {
        scope: options?.scope ?? 'chat',
        // Intent: template scope remains files-only; chat scope exposes full tab set including WorkTree.
        tabs: options?.scope === 'template' ? ['files'] : ['files', 'history', 'worktree'],
      })
      popupApp.mount(appRoot)
    } catch (e) {
      // Visible fallback so "opened but unclickable/blank" has a diagnosable UI.
      const message = e instanceof Error ? e.message : String(e)
      appRoot.textContent = `VFS popup mount failed: ${message}`
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
