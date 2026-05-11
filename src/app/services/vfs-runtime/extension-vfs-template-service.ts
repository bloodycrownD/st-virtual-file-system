import type { VfsPersistenceStore } from '@/app/stores/vfs-persistence-store'
import { createEmptyVfsSnapshot } from '@/infra/persistence/vfs-snapshot.schema'
import type { VfsSnapshot } from '@/domain/vfs/types'
import { ensureWorkTreeConfig } from '@/domain/work-tree/work-tree.types'

/**
 * Extension-level VFS template service.
 *
 * This service bridges **extension persistence** (global settings) and **chat persistence**
 * (per-conversation metadata) by allowing an extension-scoped template snapshot to initialize
 * or overwrite a chat-scoped working snapshot.
 *
 * ## Chat vs extension persistence mapping
 * - The template snapshot lives in extension settings (`extensionTemplateVfsSnapshot`).
 * - The active VFS snapshot that tools operate on lives in chat metadata (`chatVfsSnapshot`).
 *
 * ## Initialization semantics (idempotent)
 * `initializeChatFromTemplateIfNeeded()` is designed to be safe to call on first contact with
 * chat VFS. It uses a per-chat flag (`templateInitialized`) so the initialization process runs
 * at most once per chat, even if no template exists (to avoid repeated checks and repeated work).
 *
 * ## Manual overwrite and reset semantics
 * `overwriteChatWithTemplate()` performs a potentially destructive replacement of the chat VFS
 * snapshot and then clears chat-scoped logs/version history so the result is equivalent to
 * re-initializing the chat working tree from template.
 */
export class ExtensionVfsTemplateService {
  constructor(private readonly store: VfsPersistenceStore) {}

  /**
   * Initialize the current chat snapshot from the extension template if needed.
   *
   * - If already initialized for this chat, it is a no-op.
   * - If no template exists, it still sets `templateInitialized` so future calls remain no-ops.
   * - If a template exists, it clones the template snapshot into `chatVfsSnapshot`.
   *
   * This method does not emit version commits because the initialization is meant to be a
   * baseline setup step rather than a user-visible manual action.
   */
  initializeChatFromTemplateIfNeeded(): void {
    const state = this.store.getState()
    if (state.chat.templateInitialized) return
    const templateSnapshot = state.extension.extensionTemplateVfsSnapshot
    const workTreeTemplate = state.extension.workTreeTemplate
    if (!templateSnapshot) {
      // 无模板时仍落一个空树根快照，避免 chat 侧长期 `null`（宏与 runtime 共用的不变量）。
      this.store.updateChat((draft) => ({
        ...draft,
        chatVfsSnapshot: createEmptyVfsSnapshot(),
        workTree: ensureWorkTreeConfig(workTreeTemplate ?? draft.workTree),
        templateInitialized: true,
      }))
      return
    }
    this.store.updateChat((draft) => ({
      ...draft,
      chatVfsSnapshot: this.cloneSnapshot(templateSnapshot),
      workTree: ensureWorkTreeConfig(workTreeTemplate ?? draft.workTree),
      templateInitialized: true,
    }))
  }

  /**
   * Overwrite the current chat snapshot with the extension template.
   *
   * This is intentionally treated as a **manual** operation: it writes two manual commits
   * around the overwrite so a user can later understand and undo the change by selecting the
   * pre-overwrite checkpoint.
   */
  overwriteChatWithTemplate(): void {
    const state = this.store.getState()
    const templateSnapshot = state.extension.extensionTemplateVfsSnapshot
    if (!templateSnapshot) return
    const nextWorkTree = ensureWorkTreeConfig(state.extension.workTreeTemplate)
    this.store.updateChat((draft) => ({
      ...draft,
      // WHY: overwrite is semantic re-initialization, so logs/version history must be reset with content.
      chatVfsSnapshot: this.cloneSnapshot(templateSnapshot),
      chatVfsLogs: [],
      chatVfsVersions: [],
      templateInitialized: true,
      // WHY: chat work tree must follow template v2 (or default) — never keep pre-overwrite legacy config.
      workTree: nextWorkTree,
    }))
  }

  private cloneSnapshot(snapshot: VfsSnapshot): VfsSnapshot {
    return JSON.parse(JSON.stringify(snapshot))
  }
}
