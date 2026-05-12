import { VFS_ERROR_CODES } from '@/app/constants/vfsErrorCodes'
import { emitVfsEvent, VFS_STATE_REFRESH_REQUIRED } from '@/app/composables/components-composables/useVfsMessageHooks'
import { vfsSnapshotService } from '@/app/stores/vfs-store-singleton'
import { toVfsErrorToast } from '@/app/utils/vfsErrorMapper'

export async function useVfsSnapshotRollback(snapshotId: string): Promise<boolean> {
  const result = vfsSnapshotService.applySnapshotById(snapshotId.trim())
  if (result.ok) {
    emitVfsEvent(VFS_STATE_REFRESH_REQUIRED)
    return true
  }
  toastr.error(toVfsErrorToast(result.errorCode ?? VFS_ERROR_CODES.ROLLBACK_FAILED, result.message))
  return false
}
