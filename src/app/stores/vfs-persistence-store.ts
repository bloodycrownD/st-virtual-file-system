import type { StContextAdapter } from '@/infra/persistence/st-context-adapter'
import {
  parseVfsExtensionSettings,
  serializeVfsExtensionSettings,
  type VfsExtensionSettings,
} from '@/infra/persistence/vfs-extension-settings.schema'
import { parseVfsChatMetadata, serializeVfsChatMetadata, type VfsChatMetadata } from '@/infra/persistence/vfs-chat-metadata.schema'

export interface VfsPersistenceState {
  extension: VfsExtensionSettings
  chat: VfsChatMetadata
}

type Listener = (state: Readonly<VfsPersistenceState>) => void

export interface VfsPersistenceStore {
  init: () => void
  reloadChatState: () => void
  setExtensionEnabled: (enabled: boolean) => void
  setChatMounted: (mounted: boolean) => void
  subscribe: (listener: Listener) => () => void
  getState: () => Readonly<VfsPersistenceState>
}

export function createVfsPersistenceStore(adapter: StContextAdapter): VfsPersistenceStore {
  let state: VfsPersistenceState = {
    extension: parseVfsExtensionSettings({}),
    chat: parseVfsChatMetadata({}),
  }
  const listeners = new Set<Listener>()

  const notify = () => {
    for (const listener of listeners) {
      listener(state)
    }
  }

  const readExtension = () => {
    try {
      state = { ...state, extension: parseVfsExtensionSettings(adapter.readExtensionRaw()) }
    } catch {
      state = { ...state, extension: parseVfsExtensionSettings({}) }
    }
  }

  const readChat = () => {
    try {
      state = { ...state, chat: parseVfsChatMetadata(adapter.readChatRaw()) }
    } catch {
      state = { ...state, chat: parseVfsChatMetadata({}) }
    }
  }

  return {
    init: () => {
      readExtension()
      readChat()
      notify()
    },
    reloadChatState: () => {
      readChat()
      notify()
    },
    setExtensionEnabled: (enabled) => {
      state = { ...state, extension: { ...state.extension, enabled } }
      adapter.writeExtensionRaw(serializeVfsExtensionSettings(state.extension))
      adapter.saveExtension()
      notify()
    },
    setChatMounted: (mounted) => {
      state = { ...state, chat: { ...state.chat, mounted } }
      adapter.writeChatRaw(serializeVfsChatMetadata(state.chat))
      adapter.saveChat()
      notify()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getState: () => state,
  }
}
