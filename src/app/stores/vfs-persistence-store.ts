/**
 * vfs 持久化「领域 store」（不是 Vuex/Pinia，就是普通的订阅式状态容器）。
 *
 * 数据分两类：
 * - extension：全局 extensionSettings[name]
 * - chat：当前会话 chatMetadata[name]（切换会话后内容由 adapter.reload 读出另一份）
 *
 * getState()/notify 时使用 snapshot 浅拷贝，避免外部篡改内部可变引用。
 */
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
  updateExtension: (updater: (draft: VfsExtensionSettings) => VfsExtensionSettings) => void
  setChatMounted: (mounted: boolean) => void
  updateChat: (updater: (draft: VfsChatMetadata) => VfsChatMetadata) => void
  subscribe: (listener: Listener) => () => void
  getState: () => Readonly<VfsPersistenceState>
}

export function createVfsPersistenceStore(adapter: StContextAdapter): VfsPersistenceStore {
  let state: VfsPersistenceState = {
    extension: parseVfsExtensionSettings({}),
    chat: parseVfsChatMetadata({}),
  }
  const listeners = new Set<Listener>()
  /** 返回与内部 state 断开的拷贝，订阅回调与 UI 都只能拿到快照 */
  const snapshot = (): VfsPersistenceState => ({
    extension: { ...state.extension },
    chat: {
      ...state.chat,
      chatVfsLogs: [...state.chat.chatVfsLogs],
      chatVfsVersions: [...state.chat.chatVfsVersions],
    },
  })

  const notify = () => {
    const safeState = snapshot()
    for (const listener of listeners) {
      listener(safeState)
    }
  }

  /**
   * 比较磁盘上读的 raw 键值与 schema 规整后的快照是否一致。
   * 不一致则写回，用于「补齐缺省字段」「修正类型」而不丢用户已存数据。
   */
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

  /** 读全局扩展配置 → 写入内存；若磁盘形态与规整后不一致则回写纠偏 */
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

  /** 读当前聊天的 metadata 段；会话切换后由 reloadChatState 再次调用此方法 */
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
    /** 扩展启动：拉齐 extension + chat 两段数据并通知监听者 */
    init: () => {
      readExtension()
      readChat()
      notify()
    },
    /** CHAT_CHANGED 时调用：只重载会话段，不重读全局扩展（避免不必要 IO） */
    reloadChatState: () => {
      readChat()
      notify()
    },
    /** UI 勾选等：修改 extension.enabled 并落盘 extensionSettings */
    setExtensionEnabled: (enabled) => {
      state = { ...state, extension: { ...state.extension, enabled } }
      adapter.writeExtensionRaw(serializeVfsExtensionSettings(state.extension))
      adapter.saveExtension()
      notify()
    },
    updateExtension: (updater) => {
      state = { ...state, extension: updater({ ...state.extension }) }
      adapter.writeExtensionRaw(serializeVfsExtensionSettings(state.extension))
      adapter.saveExtension()
      notify()
    },
    /** 示例：会话内布尔字段写入 chatMetadata[name]（可按业务更名/扩展字段） */
    setChatMounted: (mounted) => {
      state = { ...state, chat: { ...state.chat, mounted } }
      adapter.writeChatRaw(serializeVfsChatMetadata(state.chat))
      adapter.saveChat()
      notify()
    },
    updateChat: (updater) => {
      const next = updater({
        ...state.chat,
        chatVfsLogs: [...state.chat.chatVfsLogs],
        chatVfsVersions: [...state.chat.chatVfsVersions],
      })
      state = { ...state, chat: next }
      adapter.writeChatRaw(serializeVfsChatMetadata(state.chat))
      adapter.saveChat()
      notify()
    },
    /** Vue 或其它模块订阅内存状态变化；返回函数用于取消订阅 */
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    /** 只读快照，修改返回值不会影响 store 内部 */
    getState: () => snapshot(),
  }
}
