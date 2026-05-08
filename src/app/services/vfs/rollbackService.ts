import { VFS_ERROR_CODES } from '@/app/constants/vfsErrorCodes'
import type { VfsActionResult } from '@/app/services/vfs/commitService'
import { vfsPersistenceStore } from '@/app/stores/vfs-store-singleton'
import { serializeVfsSnapshot } from '@/infra/persistence/vfs-snapshot.schema'

export interface RollbackPayload {
  commitId: string
}

export interface BatchRollbackPayload {
  commitIds: string[]
}

export async function rollbackCommit(payload: RollbackPayload): Promise<VfsActionResult> {
  if (!payload.commitId.trim()) {
    return { ok: false, errorCode: VFS_ERROR_CODES.ROLLBACK_FAILED, message: 'Commit id is required' }
  }
  const state = vfsPersistenceStore.getState().chat
  const target = state.chatVfsVersions.find((entry) => entry.id === payload.commitId.trim())
  const snapshot = target?.snapshot
  if (!snapshot) {
    return {
      ok: false,
      errorCode: VFS_ERROR_CODES.COMMIT_APPLY_FAILED,
      message: 'Commit snapshot is unavailable',
    }
  }

  // WHY: rollback resolution must come from execution result against persisted state, not UI pre-checks.
  vfsPersistenceStore.updateChat((draft) => ({
    ...draft,
    chatVfsSnapshot: serializeVfsSnapshot(snapshot),
  }))
  return { ok: true }
}

export async function rollbackBatch(payload: BatchRollbackPayload): Promise<VfsActionResult> {
  if (payload.commitIds.length === 0) {
    return { ok: false, errorCode: VFS_ERROR_CODES.BATCH_ROLLBACK_FAILED, message: 'At least one commit is required' }
  }
  const targetId = payload.commitIds[0]?.trim()
  if (!targetId) {
    return { ok: false, errorCode: VFS_ERROR_CODES.BATCH_ROLLBACK_FAILED, message: 'At least one commit is required' }
  }
  return rollbackCommit({ commitId: targetId })
}
