import { VFS_ERROR_CODES } from '@/app/constants/vfsErrorCodes'
import { emitVfsEvent, VFS_STATE_REFRESH_REQUIRED } from '@/app/composables/components-composables/useVfsMessageHooks'
import { rollbackBatch, rollbackCommit } from '@/app/services/vfs/rollbackService'
import { vfsPersistenceStore } from '@/app/stores/vfs-store-singleton'
import { serializeVfsSnapshot } from '@/infra/persistence/vfs-snapshot.schema'
import { toVfsErrorToast } from '@/app/utils/vfsErrorMapper'
import type { VfsSourceVersionRef } from '@/infra/persistence/vfs-chat-metadata.schema'

function appendManualCommit(
  summary: string,
  actionType: 'rollback' | 'batch-rollback',
  sourceVersion: VfsSourceVersionRef,
  sourceVersions?: VfsSourceVersionRef[],
): void {
  const time = new Date().toISOString()
  const currentSnapshot = serializeVfsSnapshot(vfsPersistenceStore.getState().chat.chatVfsSnapshot)
  const entry = {
    id: `commit-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    time,
    operator: 'assistant',
    actionType,
    scope: '*',
    sourceVersion,
    sourceVersions,
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
    appendManualCommit(`rollback -> ${commitId}`, 'rollback', { id: commitId, reason: 'rollback-target' })
    emitVfsEvent(VFS_STATE_REFRESH_REQUIRED)
    return true
  }
  toastr.error(toVfsErrorToast(result.errorCode ?? VFS_ERROR_CODES.ROLLBACK_FAILED, result.message))
  return false
}

export async function useVfsBatchRollbackAction(commitIds: string[]): Promise<boolean> {
  const result = await rollbackBatch({ commitIds })
  if (result.ok) {
    const normalized = commitIds.map((id) => id.trim()).filter(Boolean)
    const appliedTargetId = normalized[normalized.length - 1] ?? ''
    const sources = normalized.map((id) => ({ id, reason: 'batch-rollback-target' as const }))
    appendManualCommit(
      `batch-rollback -> ${normalized.join(', ')}`,
      'batch-rollback',
      { id: appliedTargetId, reason: 'batch-rollback-target' },
      sources,
    )
    emitVfsEvent(VFS_STATE_REFRESH_REQUIRED)
    return true
  }
  toastr.error(toVfsErrorToast(result.errorCode ?? VFS_ERROR_CODES.BATCH_ROLLBACK_FAILED, result.message))
  return false
}
