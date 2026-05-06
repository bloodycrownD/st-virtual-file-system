export interface VfsChatMetadata {
  mounted: boolean
}

const DEFAULT_CHAT_METADATA: VfsChatMetadata = {
  mounted: false,
}

export function parseVfsChatMetadata(raw: unknown): VfsChatMetadata {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_CHAT_METADATA }
  }

  const input = raw as { mounted?: unknown }
  return {
    mounted: typeof input.mounted === 'boolean' ? input.mounted : DEFAULT_CHAT_METADATA.mounted,
  }
}

export function serializeVfsChatMetadata(state: VfsChatMetadata): Record<string, boolean> {
  return {
    mounted: Boolean(state.mounted),
  }
}
