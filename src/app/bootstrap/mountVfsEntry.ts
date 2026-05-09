import { emitVfsEvent, VFS_POPUP_OPENED } from '@/app/composables/components-composables/useVfsMessageHooks'
import { mountVfsEntry } from '@/app/composables/screens-composables/useVfsEntryMount'
import { useVfsPopupLifecycle } from '@/app/composables/screens-composables/useVfsPopupLifecycle'

let cleanupMount: (() => void) | null = null
const popup = useVfsPopupLifecycle()
let mountObserver: MutationObserver | null = null
let mountRetryTimer: number | null = null
let mountAttempts = 0
const MAX_MOUNT_ATTEMPTS = 40

export function mountVfsEntryButton(): void {
  // WHY: `.extraMesButtons` can be created/replaced after initial extension load (chat switch/rerender).
  // Keep a bounded retry loop; once mount succeeds we dispose the observer/timer.
  const stopRetry = () => {
    mountObserver?.disconnect()
    mountObserver = null
    if (mountRetryTimer) {
      window.clearInterval(mountRetryTimer)
      mountRetryTimer = null
    }
    mountAttempts = 0
  }

  const nextCleanup = mountVfsEntry(() => {
    popup.open()
    emitVfsEvent(VFS_POPUP_OPENED)
  })
  // WHY: repeated bootstrap runs must not overwrite/drop the active cleanup handle when a mount
  // attempt fails (e.g. host not present yet). Only replace the handle when we successfully mount.
  if (nextCleanup) {
    cleanupMount = nextCleanup
    stopRetry()
    return
  }

  if (typeof document === 'undefined') return
  if (mountObserver || mountRetryTimer) return

  const tryMount = () => {
    mountAttempts += 1
    const mounted = mountVfsEntry(() => {
      popup.open()
      emitVfsEvent(VFS_POPUP_OPENED)
    })
    if (mounted) {
      cleanupMount = mounted
      stopRetry()
      return
    }
    if (mountAttempts >= MAX_MOUNT_ATTEMPTS) {
      stopRetry()
    }
  }

  if (typeof MutationObserver !== 'undefined') {
    mountObserver = new MutationObserver(() => {
      tryMount()
    })
    mountObserver.observe(document.body, { childList: true, subtree: true })
  }
  mountRetryTimer = window.setInterval(tryMount, 250)
}

export function unmountVfsEntryButton(): void {
  mountObserver?.disconnect()
  mountObserver = null
  if (mountRetryTimer) {
    window.clearInterval(mountRetryTimer)
    mountRetryTimer = null
  }
  mountAttempts = 0
  cleanupMount?.()
  cleanupMount = null
  popup.close()
}
