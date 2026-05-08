import { VfsCore } from '@/domain/vfs/vfs-core'
import { DeflateContentCodec } from '@/infra/serialization/deflate-codec'
import type { VfsPersistenceStore } from '@/app/stores/vfs-persistence-store'
import type { ToolDispatcher, ToolBatchExecutionResult } from '@/app/services/virtual-tools/tool-dispatcher'
import type { ToolCallEnvelope } from '@/app/services/virtual-tools/tool-contracts'
import type { ChatVfsVersionService } from '@/app/services/vfs-version/chat-vfs-version-service'
import type { ExtensionVfsTemplateService } from '@/app/services/vfs-runtime/extension-vfs-template-service'

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
 * This design ensures the persisted chat VFS never reflects a partially-applied tool batch.
 *
 * ## Commit metadata
 * After a successful batch, this runtime also records a commit in `ChatVfsVersionService`
 * with `source = 'tool'` (via `commitByToolBatch`) so downstream UI/diagnostics can attribute
 * changes to **tool execution** rather than manual/system updates.
 */
export class ChatVfsRuntime {
  constructor(
    private readonly store: VfsPersistenceStore,
    private readonly dispatcher: ToolDispatcher,
    private readonly versionService: ChatVfsVersionService,
    private readonly templateService?: ExtensionVfsTemplateService,
  ) {}

  /**
   * Execute a tool-call envelope against the current chat VFS.
   *
   * - Initializes the chat snapshot from an extension template once (idempotent) if configured.
   * - Runs the entire envelope against a working-copy `VfsCore`.
   * - On failure: returns the dispatcher result and **does not** persist any VFS changes.
   * - On success: persists the new snapshot as a single write, then records a `'tool'` commit.
   *
   * @param envelope Tool-call envelope to execute as an atomic batch.
   * @returns The batch execution result from the tool dispatcher.
   */
  executeBatch(envelope: ToolCallEnvelope): ToolBatchExecutionResult {
    // 首次触达 chat VFS 时尝试模板初始化（幂等）。
    this.templateService?.initializeChatFromTemplateIfNeeded()
    const state = this.store.getState()
    const working = new VfsCore(new DeflateContentCodec())
    working.importSnapshot(state.chat.chatVfsSnapshot)
    // before/after 用于后续版本摘要（当前简化为 '*' 级别）。
    const before = JSON.stringify(working.exportSnapshot())
    const result = this.dispatcher.executeEnvelope(envelope, working)
    // 失败时直接丢弃工作副本，不触发持久化，即完成回滚。
    if (!result.ok) {
      return result
    }
    const afterSnapshot = working.exportSnapshot()
    const changedFiles = this.diffChangedPaths(before, JSON.stringify(afterSnapshot))
    // Apply only after all tool calls succeed to preserve transactional semantics.
    this.store.updateChat((draft) => ({ ...draft, chatVfsSnapshot: afterSnapshot }))
    this.versionService.commitByToolBatch(`tool-batch (${envelope.calls.length} calls)`, changedFiles)
    return result
  }

  /**
   * Whether virtual tool-call execution is enabled at the extension level.
   *
   * Note: this does not check per-chat state; it reflects the global extension toggle.
   */
  isVirtualToolCallEnabled(): boolean {
    return this.store.getState().extension.virtualToolCallEnabled
  }

  /**
   * Record a manual commit entry for the current chat.
   *
   * This is used for changes initiated by the user/UI (e.g. explicit “save”, template overwrite
   * checkpoints, or other non-tool operations) so history can distinguish manual actions from
   * tool batches and system events.
   */
  commitManualSave(summary: string, changedFiles: string[]): void {
    this.versionService.commitByManualSave(summary, changedFiles)
  }

  /**
   * Compute changed-path hints between two snapshots.
   *
   * Current implementation is intentionally coarse-grained (`'*'`) to avoid the cost and
   * complexity of a deep VFS diff at runtime; consumers should treat `'*'` as “unknown or many”.
   */
  private diffChangedPaths(before: string, after: string): string[] {
    if (before === after) return []
    return ['*']
  }
}
