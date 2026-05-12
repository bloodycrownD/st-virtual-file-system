import { VfsCore } from '@/domain/vfs/vfs-core'
import { DeflateContentCodec } from '@/infra/serialization/deflate-codec'
import type { VfsPersistenceStore } from '@/app/stores/vfs-persistence-store'
import type { ToolDispatcher, ToolBatchExecutionResult } from '@/app/services/virtual-tools/tool-dispatcher'
import type { ToolCallEnvelope } from '@/app/services/virtual-tools/tool-contracts'
import type { ExtensionVfsTemplateService } from '@/app/services/vfs-runtime/extension-vfs-template-service'
import type { ChatVfsSnapshotService } from '@/app/services/vfs-snapshot/chat-vfs-snapshot-service'
import type { ChatVfsLogEntry } from '@/infra/persistence/vfs-chat-metadata.schema'
import { serializeVfsSnapshot } from '@/infra/persistence/vfs-snapshot.schema'
import { trimChatVfsLogsByBytes } from '@/app/services/vfs-log/chat-vfs-log-service'

export interface ToolBatchLogContext {
  chatId: string
  messageId: string
  startedAt: number
  batchId: string
}

/**
 * Chat VFS runtime for executing virtual tool calls against the per-chat VFS.
 *
 * ## Transaction semantics (working copy → persist-on-success)
 * This runtime intentionally treats a tool batch as a **transaction**:
 *
 * - **Working copy**: each `executeBatch()` creates an in-memory `VfsCore` and imports the
 *   current chat snapshot into it. All tool calls in the envelope operate on this working copy.
 * - **Persist-on-success**: the chat snapshot is only written back to the persistence store if
 *   (and only if) the entire batch succeeds. If any call fails, the working copy is discarded,
 *   resulting in a rollback to the previously persisted snapshot.
 *
 * ## Snapshot manifests (pre-batch)
 * After a successful batch, the runtime records a path manifest derived from the **pre-batch**
 * tree for all structurally changed paths, then trims the snapshot FIFO (`snapshotMaxCount`).
 * When `logContext` is provided, the batch success log line is written in the **same** `updateChat`
 * so `snapshotId` stays aligned with persisted manifests under normal log retention.
 */
export class ChatVfsRuntime {
  constructor(
    private readonly store: VfsPersistenceStore,
    private readonly dispatcher: ToolDispatcher,
    private readonly snapshotService: ChatVfsSnapshotService,
    private readonly templateService?: ExtensionVfsTemplateService,
  ) {}

  /**
   * Execute a tool-call envelope against the current chat VFS.
   *
   * - Initializes the chat snapshot from an extension template once (idempotent) if configured.
   * - Runs the entire envelope against a working-copy `VfsCore`.
   * - On failure: returns the dispatcher result and **does not** persist any VFS changes.
   * - On success: persists snapshot + optional pre-batch manifest + optional batch log in one write.
   */
  executeBatch(
    envelope: ToolCallEnvelope,
    logContext?: ToolBatchLogContext,
  ): ToolBatchExecutionResult & { snapshotId?: string } {
    this.templateService?.initializeChatFromTemplateIfNeeded()
    const state = this.store.getState()
    const working = new VfsCore(new DeflateContentCodec())
    working.importSnapshot(state.chat.chatVfsSnapshot)
    const beforeSnap = serializeVfsSnapshot(working.exportSnapshot())
    const result = this.dispatcher.executeEnvelope(envelope, working)
    if (!result.ok) {
      return result
    }
    const afterSnapshot = working.exportSnapshot()
    const record = this.snapshotService.buildToolBatchPreRecord(beforeSnap, afterSnapshot)
    const maxBytes = this.store.getState().extension.logMaxBytes
    let snapshotId: string | undefined
    this.store.updateChat((draft) => {
      const snapshots = record
        ? this.snapshotService.mergeIntoChatSnapshots(draft.chatVfsSnapshots, record)
        : draft.chatVfsSnapshots
      snapshotId = record?.id
      let logs = draft.chatVfsLogs
      if (logContext) {
        const batchEntry: ChatVfsLogEntry = {
          id: `log-${Date.now()}`,
          timestamp: Date.now(),
          chatId: logContext.chatId,
          messageId: logContext.messageId,
          batchId: logContext.batchId,
          toolName: 'batch',
          status: 'success',
          durationMs: Date.now() - logContext.startedAt,
          argsSummary: `calls=${envelope.calls.length}`,
          ...(snapshotId ? { snapshotId } : {}),
        }
        logs = trimChatVfsLogsByBytes([...draft.chatVfsLogs, batchEntry], maxBytes)
      }
      return {
        ...draft,
        chatVfsSnapshot: afterSnapshot,
        chatVfsSnapshots: snapshots,
        chatVfsLogs: logs,
      }
    })
    return { ...result, snapshotId }
  }

  isVirtualToolCallEnabled(): boolean {
    return this.store.getState().extension.virtualToolCallEnabled
  }
}
