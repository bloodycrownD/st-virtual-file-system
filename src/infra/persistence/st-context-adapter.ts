export interface StContextAdapter {
  readExtensionRaw: () => unknown
  writeExtensionRaw: (raw: Record<string, unknown>) => void
  saveExtension: () => void
  readChatRaw: () => unknown
  writeChatRaw: (raw: Record<string, unknown>) => void
  saveChat: () => void
}

function getSafeContext() {
  if (typeof SillyTavern === 'undefined') {
    return null
  }
  return SillyTavern.getContext()
}

function ensureRecord(input: unknown): Record<string, unknown> {
  if (input && typeof input === 'object') {
    return input as Record<string, unknown>
  }
  return {}
}

export function createStContextAdapter(extensionName: string): StContextAdapter {
  return {
    readExtensionRaw: () => {
      const context = getSafeContext()
      if (!context) {
        return {}
      }
      const extSettings = ensureRecord(context.extensionSettings[extensionName])
      context.extensionSettings[extensionName] = extSettings
      return extSettings
    },
    writeExtensionRaw: (raw) => {
      const context = getSafeContext()
      if (!context) {
        return
      }
      context.extensionSettings[extensionName] = ensureRecord(raw)
    },
    saveExtension: () => {
      const context = getSafeContext()
      context?.saveSettingsDebounced()
    },
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
    writeChatRaw: (raw) => {
      const context = getSafeContext()
      if (!context) {
        return
      }
      const metadata = ensureRecord(context.chatMetadata)
      metadata[extensionName] = ensureRecord(raw)
      context.chatMetadata = metadata
    },
    saveChat: () => {
      const context = getSafeContext()
      context?.saveMetadata()
    },
  }
}
