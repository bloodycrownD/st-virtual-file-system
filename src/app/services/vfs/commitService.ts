import { VFS_ERROR_CODES } from '@/app/constants/vfsErrorCodes'

export interface VfsActionResult {
  ok: boolean
  errorCode?: string
  message?: string
}

export interface SaveCommitPayload {
  summary: string
}

export async function saveCommit(payload: SaveCommitPayload): Promise<VfsActionResult> {
  if (!payload.summary.trim()) {
    return { ok: false, errorCode: VFS_ERROR_CODES.SAVE_FAILED, message: 'Commit summary is required' }
  }
  return { ok: true }
}
