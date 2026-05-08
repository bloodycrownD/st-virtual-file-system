import { VFS_ERROR_CODES } from '@/app/constants/vfsErrorCodes'
import { rollbackBatch, rollbackCommit } from '@/app/services/vfs/rollbackService'
import { toVfsErrorToast } from '@/app/utils/vfsErrorMapper'

export async function useVfsRollbackAction(commitId: string): Promise<boolean> {
  const result = await rollbackCommit({ commitId })
  if (result.ok) return true
  toastr.error(toVfsErrorToast(result.errorCode ?? VFS_ERROR_CODES.ROLLBACK_FAILED, result.message))
  return false
}

export async function useVfsBatchRollbackAction(commitIds: string[]): Promise<boolean> {
  const result = await rollbackBatch({ commitIds })
  if (result.ok) return true
  toastr.error(toVfsErrorToast(result.errorCode ?? VFS_ERROR_CODES.BATCH_ROLLBACK_FAILED, result.message))
  return false
}
