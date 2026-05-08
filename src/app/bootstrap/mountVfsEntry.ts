import { emitVfsEvent, VFS_POPUP_OPENED } from '@/app/composables/components-composables/useVfsMessageHooks'
import { mountVfsEntry } from '@/app/composables/screens-composables/useVfsEntryMount'
import { useVfsPopupLifecycle } from '@/app/composables/screens-composables/useVfsPopupLifecycle'

let cleanupMount: (() => void) | null = null
const popup = useVfsPopupLifecycle()

export function mountVfsEntryButton(): void {
  const nextCleanup = mountVfsEntry(() => {
    popup.open()
    emitVfsEvent(VFS_POPUP_OPENED)
  })
  // WHY: repeated bootstrap runs must not overwrite/drop the active cleanup handle when a mount
  // attempt fails (e.g. host not present yet). Only replace the handle when we successfully mount.
  if (nextCleanup) cleanupMount = nextCleanup
}

export function unmountVfsEntryButton(): void {
  cleanupMount?.()
  cleanupMount = null
  popup.close()
}
