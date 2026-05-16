import { VfsCore } from '@/domain/vfs/vfs-core'
import { DeflateContentCodec } from '@/infra/serialization/deflate-codec'
import type { VfsPersistenceStore } from '@/app/stores/vfs-persistence-store'
import type { ToolDispatcher, ToolBatchExecutionResult } from '@/app/services/virtual-tools/tool-dispatcher'
import type { ToolCallEnvelope } from '@/app/services/virtual-tools/tool-contracts'
import type { ExtensionVfsTemplateService } from '@/app/services/vfs-runtime/extension-vfs-template-service'
import type { ChatVfsCheckpointService } from '@/app/services/vfs-checkpoint/chat-vfs-checkpoint-service'
import type { ChatVfsLogEntry } from '@/infra/persistence/vfs-chat-metadata.schema'
import { trimChatVfsLogsByBytes } from '@/app/services/vfs-log/chat-vfs-log-service'

function summarizeArgs(args: Record<string, unknown>): string {
  const keys = Object.keys(args)
  return keys.slice(0, 4).join(',')
}

/** Per-tool success diagnostics folded into the same `updateChat` as the batch row (when `logContext` is set). */
function collectPerToolSuccessLogEntries(
  envelope: ToolCallEnvelope,
  batch: ToolBatchExecutionResult,
  logContext: ToolBatchLogContext,
  timestamp: number,
): ChatVfsLogEntry[] {
  const entries: ChatVfsLogEntry[] = []
  envelope.calls.forEach((call, index) => {
    const item = batch.results[index]
    if (!item) return
    entries.push({
      id: `log-${timestamp}-${index}`,
      timestamp,
      chatId: logContext.chatId,
      messageId: logContext.messageId,
      batchId: logContext.batchId,
      toolName: item.tool,
      status: 'success',
      durationMs: 0,
      argsSummary: summarizeArgs(call.args ?? {}),
    })
    const maybeReadData = item.tool === 'read' && item.data && typeof item.data === 'object' ? item.data : null
    const truncated =
      maybeReadData && 'truncated' in maybeReadData && (maybeReadData as { truncated: unknown }).truncated === true
    if (truncated) {
      entries.push({
        id: `log-${timestamp}-${index}-truncated`,
        timestamp,
        chatId: logContext.chatId,
        messageId: logContext.messageId,
        batchId: logContext.batchId,
        toolName: item.tool,
        status: 'success',
        durationMs: 0,
        argsSummary: 'read-truncated',
        errorCode: 'READ_TRUNCATED',
        errorMessage: 'Read output truncated by hard caps',
      })
    }
  })
  return entries
}

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
 * - **Working copy**: each `executeBatch()` imports the persisted chat snapshot into `VfsCore`.
 * - **Persist-on-success**: the chat snapshot is only written if the entire batch succeeds.
 *
 * ## Post-commit checkpoints
 * After a successful batch, the runtime records a **sparse post-commit** checkpoint derived from the
 * **after** tree, then FIFO-trims checkpoints (`snapshotMaxCount`). When `logContext` is provided,
 * the batch success row is appended in the **same** `updateChat` so `checkpointId` stays aligned.
 */
export class ChatVfsRuntime {
  constructor(
    private readonly store: VfsPersistenceStore,
    private readonly dispatcher: ToolDispatcher,
    private readonly checkpointService: ChatVfsCheckpointService,
    private readonly templateService?: ExtensionVfsTemplateService,
  ) {}

  /**
   * Execute a tool-call envelope against the current chat VFS.
   *
   * - Initializes the chat snapshot from an extension template once (idempotent) if configured.
   * - Runs the entire envelope against a working-copy `VfsCore`.
   * - On failure: returns the dispatcher result and **does not** persist any VFS changes.
   * - On success: persists snapshot + post-commit checkpoint + optional batch log in one write.
   */
  executeBatch(
    envelope: ToolCallEnvelope,
    logContext?: ToolBatchLogContext,
  ): ToolBatchExecutionResult & { checkpointId?: string } {
    this.templateService?.initializeChatFromTemplateIfNeeded()
    const state = this.store.getState()
    const working = new VfsCore(new DeflateContentCodec())
    working.importSnapshot(state.chat.chatVfsSnapshot)
    const result = this.dispatcher.executeEnvelope(envelope, working)
    if (!result.ok) {
      return result
    }
    const afterSnapshot = working.exportSnapshot()
    const maxBytes = this.store.getState().extension.logMaxBytes
    let checkpointId: string | undefined
    const logTimestamp = Date.now()
    this.store.updateChat((draft) => {
      const merged = this.checkpointService.mergePostCommitCheckpoint(draft, afterSnapshot, 'tool-batch')
      checkpointId = merged.checkpointId
      let logs = draft.chatVfsLogs
      if (logContext) {
        const batchEntry: ChatVfsLogEntry = {
          id: `log-${logTimestamp}-batch`,
          timestamp: logTimestamp,
          chatId: logContext.chatId,
          messageId: logContext.messageId,
          batchId: logContext.batchId,
          toolName: 'batch',
          status: 'success',
          durationMs: logTimestamp - logContext.startedAt,
          argsSummary: `calls=${envelope.calls.length}`,
          checkpointId,
        }
        const perTool = collectPerToolSuccessLogEntries(envelope, result, logContext, logTimestamp)
        logs = trimChatVfsLogsByBytes([...draft.chatVfsLogs, batchEntry, ...perTool], maxBytes)
      }
      return {
        ...draft,
        chatVfsSnapshot: afterSnapshot,
        vfsPathVersionStore: merged.vfsPathVersionStore,
        vfsCheckpoints: merged.vfsCheckpoints,
        chatVfsLogs: logs,
      }
    })
    return { ...result, checkpointId }
  }

  /** Single-tool wrapper for Function Calling (`executeBatch` without `logContext`). */
  executeSingleTool(
    tool: string,
    args: Record<string, unknown>,
  ): ToolBatchExecutionResult & { checkpointId?: string } {
    return this.executeBatch({ calls: [{ tool, args }] })
  }

  isVirtualToolCallEnabled(): boolean {
    const ext = this.store.getState().extension
    return ext.enabled && ext.virtualToolCallEnabled
  }
}
