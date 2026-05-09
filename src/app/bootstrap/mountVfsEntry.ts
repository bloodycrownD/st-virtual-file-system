import { emitVfsEvent, VFS_POPUP_OPENED } from '@/app/composables/components-composables/useVfsMessageHooks'
import { mountVfsEntry } from '@/app/composables/screens-composables/useVfsEntryMount'
import { useVfsPopupLifecycle } from '@/app/composables/screens-composables/useVfsPopupLifecycle'

let cleanupMount: (() => void) | null = null
const popup = useVfsPopupLifecycle()
let mountObserver: MutationObserver | null = null
let mountRetryTimer: number | null = null
let mountAttempts = 0
const MAX_MOUNT_ATTEMPTS = 40
const ENTRY_SELECTOR = '.extraMesButtons #st-vfs-entry-button'

export function mountVfsEntryButton(): void {
  const onOpen = () => {
    popup.open()
    emitVfsEvent(VFS_POPUP_OPENED)
  }
  const clearRetryTimer = () => {
    if (mountRetryTimer) {
      window.clearInterval(mountRetryTimer)
      mountRetryTimer = null
    }
  }
  const hasMountedEntry = () => typeof document !== 'undefined' && Boolean(document.querySelector(ENTRY_SELECTOR))
  const tryMount = () => {
    if (hasMountedEntry()) {
      mountAttempts = 0
      clearRetryTimer()
      return true
    }
    const mounted = mountVfsEntry(onOpen)
    if (mounted) {
      cleanupMount = mounted
      mountAttempts = 0
      clearRetryTimer()
      return true
    }
    return false
  }
  const ensureRetryLoop = () => {
    if (mountRetryTimer) return
    mountRetryTimer = window.setInterval(() => {
      mountAttempts += 1
      if (tryMount()) return
      if (mountAttempts >= MAX_MOUNT_ATTEMPTS) {
        clearRetryTimer()
      }
    }, 250)
  }
  const ensureObserver = () => {
    if (mountObserver || typeof MutationObserver === 'undefined') return
    // WHY: host rerenders can happen long after first success; keep watcher alive to self-heal remounts.
    mountObserver = new MutationObserver(() => {
      if (hasMountedEntry()) return
      if (!tryMount()) ensureRetryLoop()
    })
    mountObserver.observe(document.body, { childList: true, subtree: true })
  }

  if (tryMount()) {
    if (typeof document !== 'undefined') ensureObserver()
    return
  }
  if (typeof document === 'undefined') return
  ensureObserver()
  ensureRetryLoop()
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
