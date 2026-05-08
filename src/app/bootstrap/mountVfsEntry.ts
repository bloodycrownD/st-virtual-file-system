import { emitVfsEvent, VFS_POPUP_OPENED } from '@/app/composables/components-composables/useVfsMessageHooks'
import { mountVfsEntry } from '@/app/composables/screens-composables/useVfsEntryMount'
import { useVfsPopupLifecycle } from '@/app/composables/screens-composables/useVfsPopupLifecycle'

let cleanupMount: (() => void) | null = null
const popup = useVfsPopupLifecycle()

export function mountVfsEntryButton(): void {
  cleanupMount = mountVfsEntry(() => {
    popup.open()
    emitVfsEvent(VFS_POPUP_OPENED)
  })
}

export function unmountVfsEntryButton(): void {
  cleanupMount?.()
  cleanupMount = null
  popup.close()
}
