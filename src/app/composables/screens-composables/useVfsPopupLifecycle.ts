import { createApp, type App as VueApp } from 'vue'
import VfsMainScreen from '@/app/screens/business-screens/VfsMainScreen.vue'
import {
  emitVfsEvent,
  requestVfsPopupClose,
  VFS_POPUP_CLOSED,
} from '@/app/composables/components-composables/useVfsMessageHooks'

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
  let testButtonHandler: (() => void) | null = null
  let clickProbeHandler: ((event: MouseEvent) => void) | null = null
  let documentClickProbeHandler: ((event: MouseEvent) => void) | null = null
  const isDev = Boolean(import.meta.env?.DEV)

  const disposePopup = () => {
    if (!popup || disposeInProgress) return
    disposeInProgress = true
    if (popupApp) {
      popupApp.unmount()
      popupApp = null
    }
    if (closeButtonHandler) {
      const btn = popup.querySelector<HTMLButtonElement>('[data-st-vfs-close]')
      btn?.removeEventListener('click', closeButtonHandler)
      closeButtonHandler = null
    }
    if (testButtonHandler) {
      const btn = popup.querySelector<HTMLButtonElement>('[data-st-vfs-test]')
      btn?.removeEventListener('click', testButtonHandler)
      testButtonHandler = null
    }
    if (clickProbeHandler) {
      popup.removeEventListener('click', clickProbeHandler, true)
      clickProbeHandler = null
    }
    if (documentClickProbeHandler) {
      document.removeEventListener('click', documentClickProbeHandler, true)
      documentClickProbeHandler = null
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
    popup.style.width = '80vw'
    popup.style.maxWidth = '960px'
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
    if (isDev) {
      const testButton = document.createElement('button')
      testButton.type = 'button'
      testButton.className = 'menu_button st-vfs-popup__test'
      testButton.setAttribute('data-st-vfs-test', 'true')
      testButton.title = 'Test click (console)'
      testButton.textContent = 'Test'
      headerActions.append(testButton)
      testButtonHandler = () => {
        const label = options?.title ?? 'VFS'
        console.log('[st-vfs] popup click test', {
          label,
          popupOpen: Boolean(popup?.open),
          activeElement: document.activeElement ? (document.activeElement as Element).tagName : null,
        })
        // Visual feedback in case console is filtered/hidden.
        testButton.textContent = testButton.textContent === 'Test' ? 'Test✓' : 'Test'
      }
      testButton.addEventListener('click', testButtonHandler)
    }
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

    if (isDev) {
      // WHY: when host CSS/overlays swallow clicks, we need a capture-phase probe to prove whether events reach the dialog.
      clickProbeHandler = (event: MouseEvent) => {
        const target = event.target as Element | null
        if (!target) return
        const interesting = target.closest('button, summary, a, [role="button"], .mes_button')
        if (!interesting) return
        console.log('[st-vfs] popup click probe (dialog)', {
          target: target.tagName,
          closest: interesting.tagName,
          closestClass: (interesting as HTMLElement).className,
          closestId: (interesting as HTMLElement).id,
          defaultPrevented: event.defaultPrevented,
        })
      }
      popup.addEventListener('click', clickProbeHandler, true)

      // WHY: if clicks never reach the dialog, we still want to know if they occur and whether the composed path includes the dialog.
      documentClickProbeHandler = (event: MouseEvent) => {
        const path = typeof event.composedPath === 'function' ? event.composedPath() : []
        const includesPopup = path.includes(popup as unknown as EventTarget)
        if (!includesPopup) return
        const target = event.target as Element | null
        console.log('[st-vfs] popup click probe (document)', {
          target: target ? target.tagName : null,
          defaultPrevented: event.defaultPrevented,
        })
      }
      document.addEventListener('click', documentClickProbeHandler, true)
    }

    try {
      popupApp = createApp(VfsMainScreen, {
        scope: options?.scope ?? 'chat',
        tabs: options?.scope === 'template' ? ['files'] : ['files', 'history', 'logs'],
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
