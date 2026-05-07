/**
 * @file Thin adapter over `SillyTavern.getContext()` for extension + chat persistence.
 *
 * This adapter exists to isolate SillyTavern's mutable context API behind a small, testable
 * surface. The most important constraint is **chat switching**:
 *
 * - SillyTavern's `chatMetadata` reference can change when the user switches chats.
 * - Holding onto (caching) a previous `chatMetadata` object can cause writes to target the wrong
 *   chat or be dropped.
 *
 * For that reason **every read/write re-fetches context** and re-derives the effective metadata
 * object. This is why you'll see `getSafeContext()` called inside each method instead of caching
 * `context`/`chatMetadata` in the adapter.
 *
 * `extensionName` is used as a dedicated namespace key inside both `extensionSettings` and
 * `chatMetadata` to avoid collisions with other extensions.
 */
export interface StContextAdapter {
  readExtensionRaw: () => unknown
  writeExtensionRaw: (raw: Record<string, unknown>) => void
  saveExtension: () => void
  readChatRaw: () => unknown
  writeChatRaw: (raw: Record<string, unknown>) => void
  saveChat: () => void
}

/** 扩展脚本可能在极少数时机早于 ST 注入执行；拿不到上下文则静默返回 null */
function getSafeContext() {
  if (typeof SillyTavern === 'undefined') {
    return null
  }
  return SillyTavern.getContext()
}

/** 保证得到可写的普通对象字面量（避免后续赋值到 undefined） */
function ensureRecord(input: unknown): Record<string, unknown> {
  if (input && typeof input === 'object') {
    return input as Record<string, unknown>
  }
  return {}
}

/**
 * Creates a `StContextAdapter` scoped to one extension namespace.
 *
 * @param extensionName - Namespace key used inside `extensionSettings` and `chatMetadata`.
 */
export function createStContextAdapter(extensionName: string): StContextAdapter {
  return {
    /** 读当前扩展的全局配置块（对象引用由 ST 托管，我们只是归一化成对象） */
    readExtensionRaw: () => {
      const context = getSafeContext()
      if (!context) {
        return {}
      }
      const extSettings = ensureRecord(context.extensionSettings[extensionName])
      context.extensionSettings[extensionName] = extSettings
      return extSettings
    },
    /** 整包写回全局配置（需配合 saveExtension 才真正落盘） */
    writeExtensionRaw: (raw) => {
      const context = getSafeContext()
      if (!context) {
        return
      }
      context.extensionSettings[extensionName] = ensureRecord(raw)
    },
    /** 防抖保存全局设置（ST 官方推荐） */
    saveExtension: () => {
      const context = getSafeContext()
      context?.saveSettingsDebounced()
    },
    /** 当前会话 metadata 中我们扩展占的那一段；切换聊天后底层对象会变，此处每次重新读 context */
    readChatRaw: () => {
      const context = getSafeContext()
      if (!context) {
        return {}
      }
      const metadata = ensureRecord(context.chatMetadata)
      context.chatMetadata = metadata
      const extChat = ensureRecord(metadata[extensionName])
      metadata[extensionName] = extChat
      return extChat
    },
    /** 与会话绑定的扩展数据整块写回 chatMetadata[name] */
    writeChatRaw: (raw) => {
      const context = getSafeContext()
      if (!context) {
        return
      }
      const metadata = ensureRecord(context.chatMetadata)
      metadata[extensionName] = ensureRecord(raw)
      context.chatMetadata = metadata
    },
    /** 会话 metadata 写入后需调用才持久到服务端/本地（视 ST 版本行为） */
    saveChat: () => {
      const context = getSafeContext()
      context?.saveMetadata()
    },
  }
}
