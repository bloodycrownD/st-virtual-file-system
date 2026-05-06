export interface VfsExtensionSettings {
  enabled: boolean
}

const DEFAULT_SETTINGS: VfsExtensionSettings = {
  enabled: true,
}

export function parseVfsExtensionSettings(raw: unknown): VfsExtensionSettings {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_SETTINGS }
  }

  const input = raw as { enabled?: unknown }
  return {
    enabled: typeof input.enabled === 'boolean' ? input.enabled : DEFAULT_SETTINGS.enabled,
  }
}

export function serializeVfsExtensionSettings(state: VfsExtensionSettings): Record<string, boolean> {
  return {
    enabled: Boolean(state.enabled),
  }
}
