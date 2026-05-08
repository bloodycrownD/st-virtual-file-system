import { emitVfsEvent, VFS_POPUP_CLOSED } from '@/app/composables/components-composables/useVfsMessageHooks'
import { unmountVfsEntryButton } from '@/app/bootstrap/mountVfsEntry'

export function unmountVfsEntry(): void {
  unmountVfsEntryButton()
  emitVfsEvent(VFS_POPUP_CLOSED)
}
