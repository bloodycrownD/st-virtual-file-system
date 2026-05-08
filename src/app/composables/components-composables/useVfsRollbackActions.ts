import { VFS_ERROR_CODES } from '@/app/constants/vfsErrorCodes'
import { emitVfsEvent, VFS_STATE_REFRESH_REQUIRED } from '@/app/composables/components-composables/useVfsMessageHooks'
import { rollbackBatch, rollbackCommit } from '@/app/services/vfs/rollbackService'
import { vfsPersistenceStore } from '@/app/stores/vfs-store-singleton'
import { serializeVfsSnapshot } from '@/infra/persistence/vfs-snapshot.schema'
import { toVfsErrorToast } from '@/app/utils/vfsErrorMapper'
import type { VfsSourceVersionRef } from '@/infra/persistence/vfs-chat-metadata.schema'

function appendManualCommit(summary: string, actionType: 'rollback' | 'batch-rollback', sourceVersionId: string): void {
  const time = new Date().toISOString()
  const currentSnapshot = serializeVfsSnapshot(vfsPersistenceStore.getState().chat.chatVfsSnapshot)
  const sourceVersion: VfsSourceVersionRef = {
    id: sourceVersionId,
    reason: actionType === 'batch-rollback' ? 'batch-rollback-target' : 'rollback-target',
  }
  const entry = {
    id: `commit-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    time,
    operator: 'assistant',
    actionType,
    scope: '*',
    sourceVersion,
    snapshot: currentSnapshot,
    // WHY: write legacy mirrors during transition so old UIs keep rendering.
    timestamp: Date.parse(time),
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
    appendManualCommit(`rollback -> ${commitId}`, 'rollback', commitId)
    emitVfsEvent(VFS_STATE_REFRESH_REQUIRED)
    return true
  }
  toastr.error(toVfsErrorToast(result.errorCode ?? VFS_ERROR_CODES.ROLLBACK_FAILED, result.message))
  return false
}

export async function useVfsBatchRollbackAction(commitIds: string[]): Promise<boolean> {
  const result = await rollbackBatch({ commitIds })
  if (result.ok) {
    appendManualCommit(`batch-rollback -> ${commitIds.join(', ')}`, 'batch-rollback', commitIds[0] ?? '')
    emitVfsEvent(VFS_STATE_REFRESH_REQUIRED)
    return true
  }
  toastr.error(toVfsErrorToast(result.errorCode ?? VFS_ERROR_CODES.BATCH_ROLLBACK_FAILED, result.message))
  return false
}
