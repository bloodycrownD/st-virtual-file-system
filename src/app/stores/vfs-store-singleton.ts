/**
 * 整个扩展共用的 persistence store 单例 + 一次性初始化。
 *
 * initVfsPersistenceStore()：
 * - 首次调用时从磁盘读扩展/会话两块配置进内存；
 * - 监听 CHAT_CHANGED：切换聊天后 reloadChatState()，让 chat 段与当前会话对齐。
 *
 * message 侧的 st-event-adapter 故意不再监听 CHAT_CHANGED，会话重载仅此一处。
 */
import { createVfsPersistenceStore } from '@/app/stores/vfs-persistence-store'
import { createStContextAdapter } from '@/infra/persistence/st-context-adapter'

const EXTENSION_NAME = 'st-virtual-file-system'

export const vfsPersistenceStore = createVfsPersistenceStore(createStContextAdapter(EXTENSION_NAME))

let isInitialized = false

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
    })
  }

  isInitialized = true
}
