import type { VfsPersistenceStore } from '@/app/stores/vfs-persistence-store'
import type { ChatVfsVersionEntry, VfsCommitSource } from '@/infra/persistence/vfs-chat-metadata.schema'

function createVersionEntry(source: VfsCommitSource, summary: string, changedFiles: string[]): ChatVfsVersionEntry {
  return {
    id: `commit-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    timestamp: Date.now(),
    source,
    summary,
    changedFiles,
  }
}

export class ChatVfsVersionService {
  constructor(private readonly store: VfsPersistenceStore) {}

  commitByToolBatch(summary: string, changedFiles: string[]): ChatVfsVersionEntry {
    return this.commit('tool', summary, changedFiles)
  }

  commitByManualSave(summary: string, changedFiles: string[]): ChatVfsVersionEntry {
    return this.commit('manual', summary, changedFiles)
  }

  commitSystem(summary: string, changedFiles: string[]): ChatVfsVersionEntry {
    return this.commit('system', summary, changedFiles)
  }

  listCommits(): ChatVfsVersionEntry[] {
    return [...this.store.getState().chat.chatVfsVersions]
  }

  private commit(source: VfsCommitSource, summary: string, changedFiles: string[]): ChatVfsVersionEntry {
    const entry = createVersionEntry(source, summary, changedFiles)
    this.store.updateChat((draft) => ({ ...draft, chatVfsVersions: [...draft.chatVfsVersions, entry] }))
    return entry
  }
}
