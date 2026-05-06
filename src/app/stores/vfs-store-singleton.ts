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
