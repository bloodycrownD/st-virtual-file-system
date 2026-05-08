import { VFS_ERROR_CODES } from '@/app/constants/vfsErrorCodes'
import { vfsPersistenceStore } from '@/app/stores/vfs-store-singleton'
import type { ChatVfsVersionEntry } from '@/infra/persistence/vfs-chat-metadata.schema'

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

  const time = new Date().toISOString()
  const entry: ChatVfsVersionEntry = {
    id: `commit-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    time,
    operator: 'assistant',
    actionType: 'save',
    scope: payload.summary.trim(),
    // WHY: preserve legacy fields until all readers consume the spec-native schema only.
    timestamp: Date.parse(time),
    source: 'manual',
    summary: payload.summary.trim(),
    changedFiles: [payload.summary.trim()],
  }
  vfsPersistenceStore.updateChat((draft) => ({ ...draft, chatVfsVersions: [...draft.chatVfsVersions, entry] }))
  return { ok: true }
}
