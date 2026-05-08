import { VFS_ERROR_CODES } from '@/app/constants/vfsErrorCodes'
import type { VfsActionResult } from '@/app/services/vfs/commitService'

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
  return { ok: true }
}

export async function rollbackBatch(payload: BatchRollbackPayload): Promise<VfsActionResult> {
  if (payload.commitIds.length === 0) {
    return { ok: false, errorCode: VFS_ERROR_CODES.BATCH_ROLLBACK_FAILED, message: 'At least one commit is required' }
  }
  return { ok: true }
}
