import { VFS_ERROR_CODES } from '@/app/constants/vfsErrorCodes'
import { saveCommit } from '@/app/services/vfs/commitService'
import { toVfsErrorToast } from '@/app/utils/vfsErrorMapper'

export async function useVfsCommitActions(summary: string): Promise<boolean> {
  const result = await saveCommit({ summary })
  if (result.ok) return true
  toastr.error(toVfsErrorToast(result.errorCode ?? VFS_ERROR_CODES.SAVE_FAILED, result.message))
  return false
}
