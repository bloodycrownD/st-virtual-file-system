/** 扩展级全局配置的结构化形状（仅存 JSON 友好字段）；与 adapter 里的 extensionSettings[name] 对应 */
export interface VfsExtensionSettings {
  enabled: boolean
}

/** 磁盘上尚无记录或字段缺失时的默认值 */
const DEFAULT_SETTINGS: VfsExtensionSettings = {
  enabled: true,
}

/** ST 返回的未知结构 -> 规整后的运行时对象；劣质数据回退默认 */
export function parseVfsExtensionSettings(raw: unknown): VfsExtensionSettings {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_SETTINGS }
  }

  const input = raw as { enabled?: unknown }
  return {
    enabled: typeof input.enabled === 'boolean' ? input.enabled : DEFAULT_SETTINGS.enabled,
  }
}

/** 写回 ST 前的纯字面量快照（扁平、可序列化） */
export function serializeVfsExtensionSettings(state: VfsExtensionSettings): Record<string, boolean> {
  return {
    enabled: Boolean(state.enabled),
  }
}
