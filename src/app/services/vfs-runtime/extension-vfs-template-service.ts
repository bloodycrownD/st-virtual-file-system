import type { VfsPersistenceStore } from '@/app/stores/vfs-persistence-store'
import type { ChatVfsVersionService } from '@/app/services/vfs-version/chat-vfs-version-service'

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
 * ## Manual overwrite and rollback anchors
 * `overwriteChatWithTemplate()` performs a potentially destructive replacement of the chat VFS
 * snapshot. It records **manual** commit entries before and after the overwrite to provide:
 * - A rollback anchor for the pre-overwrite state.
 * - A clear history event representing the overwrite itself.
 */
export class ExtensionVfsTemplateService {
  constructor(
    private readonly store: VfsPersistenceStore,
    private readonly versionService: ChatVfsVersionService,
  ) {}

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
    if (!state.extension.extensionTemplateVfsSnapshot) {
      // 没模板也要打初始化标记，避免每次访问重复走初始化流程。
      this.store.updateChat((draft) => ({ ...draft, templateInitialized: true }))
      return
    }
    this.store.updateChat((draft) => ({
      ...draft,
      chatVfsSnapshot: state.extension.extensionTemplateVfsSnapshot,
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
    if (!state.extension.extensionTemplateVfsSnapshot) return
    // Keep a rollback point before destructive template overwrite.
    // 覆盖前后都打 manual commit：前者是回退锚点，后者是新状态落点。
    this.versionService.commitByManualSave('pre-template-overwrite', ['*'])
    this.store.updateChat((draft) => ({
      ...draft,
      chatVfsSnapshot: state.extension.extensionTemplateVfsSnapshot,
      templateInitialized: true,
    }))
    this.versionService.commitByManualSave('manual-template-overwrite', ['*'])
  }
}
