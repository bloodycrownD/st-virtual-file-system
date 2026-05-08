import { VFS_ERROR_CODES } from '@/app/constants/vfsErrorCodes'
import { emitVfsEvent, VFS_STATE_REFRESH_REQUIRED } from '@/app/composables/components-composables/useVfsMessageHooks'
import { rollbackBatch, rollbackCommit } from '@/app/services/vfs/rollbackService'
import { vfsPersistenceStore } from '@/app/stores/vfs-store-singleton'
import { toVfsErrorToast } from '@/app/utils/vfsErrorMapper'

function appendManualCommit(summary: string): void {
  const entry = {
    id: `commit-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    timestamp: Date.now(),
    source: 'manual' as const,
    summary,
    changedFiles: ['*'],
  }
  vfsPersistenceStore.updateChat((draft) => ({ ...draft, chatVfsVersions: [...draft.chatVfsVersions, entry] }))
}

export async function useVfsRollbackAction(commitId: string): Promise<boolean> {
  // WHY: UI and specs speak in "sourceVersionId"; the service contract uses `commitId`.
  // Keep the shared service contract intact while matching UI wording at call sites.
  const result = await rollbackCommit({ commitId })
  if (result.ok) {
    appendManualCommit(`rollback -> ${commitId}`)
    emitVfsEvent(VFS_STATE_REFRESH_REQUIRED)
    return true
  }
  toastr.error(toVfsErrorToast(result.errorCode ?? VFS_ERROR_CODES.ROLLBACK_FAILED, result.message))
  return false
}

export async function useVfsBatchRollbackAction(commitIds: string[]): Promise<boolean> {
  const result = await rollbackBatch({ commitIds })
  if (result.ok) {
    appendManualCommit(`batch-rollback -> ${commitIds.join(', ')}`)
    emitVfsEvent(VFS_STATE_REFRESH_REQUIRED)
    return true
  }
  toastr.error(toVfsErrorToast(result.errorCode ?? VFS_ERROR_CODES.BATCH_ROLLBACK_FAILED, result.message))
  return false
}
