import type { ChatVfsLogEntry } from '@/infra/persistence/vfs-chat-metadata.schema'
import type { VfsPersistenceStore } from '@/app/stores/vfs-persistence-store'

export class ChatVfsLogService {
  constructor(private readonly store: VfsPersistenceStore) {}

  append(entry: ChatVfsLogEntry): void {
    this.store.updateChat((draft) => {
      const entries = [...draft.chatVfsLogs, entry]
      const maxBytes = draft.mounted ? this.store.getState().extension.logMaxBytes : this.store.getState().extension.logMaxBytes
      return { ...draft, chatVfsLogs: this.trimByBytes(entries, maxBytes) }
    })
  }

  listByMessage(messageId: string): ChatVfsLogEntry[] {
    return this.store.getState().chat.chatVfsLogs.filter((entry) => entry.messageId === messageId)
  }

  listByTimeRange(startTimestamp: number, endTimestamp: number): ChatVfsLogEntry[] {
    return this.store
      .getState()
      .chat.chatVfsLogs.filter((entry) => entry.timestamp >= startTimestamp && entry.timestamp <= endTimestamp)
  }

  clear(): void {
    this.store.updateChat((draft) => ({ ...draft, chatVfsLogs: [] }))
  }

  private trimByBytes(entries: ChatVfsLogEntry[], maxBytes: number): ChatVfsLogEntry[] {
    const queue = [...entries]
    const sizeOf = (entry: ChatVfsLogEntry): number => JSON.stringify(entry).length
    let total = queue.reduce((sum, item) => sum + sizeOf(item), 0)
    while (queue.length > 0 && total > maxBytes) {
      const first = queue.shift()
      if (first) total -= sizeOf(first)
    }
    return queue
  }
}
