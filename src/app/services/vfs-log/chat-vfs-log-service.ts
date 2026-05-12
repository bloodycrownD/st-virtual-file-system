import type { ChatVfsLogEntry } from '@/infra/persistence/vfs-chat-metadata.schema'
import type { VfsPersistenceStore } from '@/app/stores/vfs-persistence-store'

/**
 * Chat-scoped VFS log service.
 *
 * Logs are persisted in **chat metadata** (not extension settings), which makes them naturally
 * scoped to a conversation and cleared/changed when the user switches chats.
 *
 * ## Retention policy: byte cap, FIFO trimming, no TTL
 * This service enforces a **maximum serialized size** (`logMaxBytes`) by trimming the oldest
 * entries first (FIFO) until the JSON-serialized log list is under the byte budget.
 *
 * There is intentionally **no time-based TTL**:
 * - Some chats are long-lived but low-volume; TTL would discard useful diagnostics even if the
 *   total size stays small.
 * - The storage constraint here is primarily payload size, so a deterministic size cap is a
 *   better fit than time-based eviction.
 * - Size-based trimming is also stable across different user timezones and clock skews.
 */
export class ChatVfsLogService {
  constructor(private readonly store: VfsPersistenceStore) {}

  /**
   * Append a structured log entry to the current chat and trim history to the byte cap.
   *
   * Trimming uses JSON string length as a pragmatic proxy for bytes (sufficient for a client-side
   * storage budget); when over budget, the oldest entries are removed first.
   */
  append(entry: ChatVfsLogEntry): void {
    this.store.updateChat((draft) => {
      const entries = [...draft.chatVfsLogs, entry]
      // 当前实现统一使用 extension 配置中的容量上限，按 chat 维度裁剪日志列表。
      const maxBytes = draft.mounted ? this.store.getState().extension.logMaxBytes : this.store.getState().extension.logMaxBytes
      return { ...draft, chatVfsLogs: this.trimByBytes(entries, maxBytes) }
    })
  }

  /** List log entries associated with a specific message id. */
  listByMessage(messageId: string): ChatVfsLogEntry[] {
    return this.store.getState().chat.chatVfsLogs.filter((entry) => entry.messageId === messageId)
  }

  /** List log entries within an inclusive timestamp range. */
  listByTimeRange(startTimestamp: number, endTimestamp: number): ChatVfsLogEntry[] {
    return this.store
      .getState()
      .chat.chatVfsLogs.filter((entry) => entry.timestamp >= startTimestamp && entry.timestamp <= endTimestamp)
  }

  /** Remove all chat-scoped VFS logs for the current chat. */
  clear(): void {
    this.store.updateChat((draft) => ({ ...draft, chatVfsLogs: [] }))
  }

  /**
   * Trim the log list to fit within a maximum serialized size.
   *
   * The size model is `JSON.stringify(entry).length` per entry and therefore counts characters,
   * which is a close-enough budget for typical client-side JSON persistence constraints.
   */
  private trimByBytes(entries: ChatVfsLogEntry[], maxBytes: number): ChatVfsLogEntry[] {
    return trimChatVfsLogsByBytes(entries, maxBytes)
  }
}

export function trimChatVfsLogsByBytes(entries: ChatVfsLogEntry[], maxBytes: number): ChatVfsLogEntry[] {
  const queue = [...entries]
  const sizeOf = (entry: ChatVfsLogEntry): number => JSON.stringify(entry).length
  let total = queue.reduce((sum, item) => sum + sizeOf(item), 0)
  // FIFO 淘汰：优先保留最近日志，牺牲最旧记录。
  while (queue.length > 0 && total > maxBytes) {
    const first = queue.shift()
    if (first) total -= sizeOf(first)
  }
  return queue
}
