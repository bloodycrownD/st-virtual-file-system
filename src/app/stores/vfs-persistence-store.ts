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
  const snapshot = (): VfsPersistenceState => ({
    extension: { ...state.extension },
    chat: { ...state.chat },
  })

  const notify = () => {
    const safeState = snapshot()
    for (const listener of listeners) {
      listener(safeState)
    }
  }

  const isSameFlatRecord = (left: Record<string, unknown>, right: Record<string, unknown>) => {
    const leftKeys = Object.keys(left)
    const rightKeys = Object.keys(right)
    if (leftKeys.length !== rightKeys.length) {
      return false
    }
    for (const key of leftKeys) {
      if (left[key] !== right[key]) {
        return false
      }
    }
    return true
  }

  const readExtension = () => {
    try {
      const raw = adapter.readExtensionRaw()
      const parsed = parseVfsExtensionSettings(raw)
      const serialized = serializeVfsExtensionSettings(parsed)
      const rawRecord = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
      state = { ...state, extension: parsed }
      if (!isSameFlatRecord(rawRecord, serialized)) {
        adapter.writeExtensionRaw(serialized)
        adapter.saveExtension()
      }
    } catch {
      const fallback = parseVfsExtensionSettings({})
      state = { ...state, extension: fallback }
      adapter.writeExtensionRaw(serializeVfsExtensionSettings(fallback))
      adapter.saveExtension()
    }
  }

  const readChat = () => {
    try {
      const raw = adapter.readChatRaw()
      const parsed = parseVfsChatMetadata(raw)
      const serialized = serializeVfsChatMetadata(parsed)
      const rawRecord = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
      state = { ...state, chat: parsed }
      if (!isSameFlatRecord(rawRecord, serialized)) {
        adapter.writeChatRaw(serialized)
        adapter.saveChat()
      }
    } catch {
      const fallback = parseVfsChatMetadata({})
      state = { ...state, chat: fallback }
      adapter.writeChatRaw(serializeVfsChatMetadata(fallback))
      adapter.saveChat()
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
    getState: () => snapshot(),
  }
}
