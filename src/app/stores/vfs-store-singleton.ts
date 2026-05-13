/**
 * @file Singleton persistence store + one-time initialization.
 *
 * This module is the **single** owner of chat-switch persistence reload:
 *
 * - On first initialization it loads extension/global + current chat/session state into memory.
 * - It subscribes to `CHAT_CHANGED` and calls `reloadChatState()` so the in-memory chat segment
 *   always reflects the currently active chat.
 *
 * ## Why only here?
 *
 * SillyTavern's `chatMetadata` reference can change on chat switch. Re-loading chat state centrally
 * prevents duplicated subscriptions and avoids subtle bugs where multiple listeners attempt to
 * refresh state concurrently.
 *
 * The message-side event adapter intentionally does **not** subscribe to `CHAT_CHANGED`; it only
 * handles message events (received/edited/updated/deleted).
 */
import { createVfsPersistenceStore } from '@/app/stores/vfs-persistence-store'
import { createStContextAdapter } from '@/infra/persistence/st-context-adapter'
import { DeflateContentCodec } from '@/infra/serialization/deflate-codec'
import { ChatVfsCheckpointService } from '@/app/services/vfs-checkpoint/chat-vfs-checkpoint-service'

const EXTENSION_NAME = 'st-virtual-file-system'

export const vfsPersistenceStore = createVfsPersistenceStore(createStContextAdapter(EXTENSION_NAME))

const vfsCodec = new DeflateContentCodec()
export const vfsCheckpointService = new ChatVfsCheckpointService(vfsPersistenceStore, vfsCodec)

let isInitialized = false
let onChatReloadHook: (() => void) | null = null

export function registerVfsChatReloadHook(hook: (() => void) | null): void {
  onChatReloadHook = hook
}

/**
 * Initializes the singleton store once.
 *
 * Safe to call multiple times; subsequent calls are no-ops.
 */
export function initVfsPersistenceStore() {
  if (isInitialized) {
    return
  }

  vfsPersistenceStore.init()

  if (typeof SillyTavern !== 'undefined') {
    const context = SillyTavern.getContext()
    const chatChangedEvent = context.event_types.CHAT_CHANGED
    context.eventSource.on(chatChangedEvent, () => {
      vfsPersistenceStore.reloadChatState()
      // WHY: a chat switch may land on a fresh metadata segment; run post-reload hook to rehydrate derived state.
      onChatReloadHook?.()
    })
  }

  isInitialized = true
}
