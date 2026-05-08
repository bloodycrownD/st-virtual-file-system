import { VFS_ERROR_CODES } from '@/app/constants/vfsErrorCodes'
import { emitVfsEvent, VFS_STATE_REFRESH_REQUIRED } from '@/app/composables/components-composables/useVfsMessageHooks'
import { rollbackBatch, rollbackCommit } from '@/app/services/vfs/rollbackService'
import { toVfsErrorToast } from '@/app/utils/vfsErrorMapper'

export async function useVfsRollbackAction(commitId: string): Promise<boolean> {
  // WHY: UI and specs speak in "sourceVersionId"; the service contract uses `commitId`.
  // Keep the shared service contract intact while matching UI wording at call sites.
  const result = await rollbackCommit({ commitId })
  if (result.ok) {
    emitVfsEvent(VFS_STATE_REFRESH_REQUIRED)
    return true
  }
  toastr.error(toVfsErrorToast(result.errorCode ?? VFS_ERROR_CODES.ROLLBACK_FAILED, result.message))
  return false
}

export async function useVfsBatchRollbackAction(commitIds: string[]): Promise<boolean> {
  const result = await rollbackBatch({ commitIds })
  if (result.ok) {
    emitVfsEvent(VFS_STATE_REFRESH_REQUIRED)
    return true
  }
  toastr.error(toVfsErrorToast(result.errorCode ?? VFS_ERROR_CODES.BATCH_ROLLBACK_FAILED, result.message))
  return false
}
