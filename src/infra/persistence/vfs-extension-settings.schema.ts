import type { VfsSnapshot } from '@/domain/vfs/types'
import { parseVfsSnapshot, serializeVfsSnapshot } from '@/infra/persistence/vfs-snapshot.schema'

/** 扩展级全局配置的结构化形状（仅存 JSON 友好字段）；与 adapter 里的 extensionSettings[name] 对应 */
export interface VfsExtensionSettings {
  enabled: boolean
  logMaxBytes: number
  virtualToolCallEnabled: boolean
  extensionTemplateVfsSnapshot: VfsSnapshot | null
}

/** 磁盘上尚无记录或字段缺失时的默认值 */
const DEFAULT_SETTINGS: VfsExtensionSettings = {
  enabled: true,
  logMaxBytes: 1024 * 1024,
  virtualToolCallEnabled: true,
  extensionTemplateVfsSnapshot: null,
}

/** ST 返回的未知结构 -> 规整后的运行时对象；劣质数据回退默认 */
export function parseVfsExtensionSettings(raw: unknown): VfsExtensionSettings {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_SETTINGS }
  }

  const input = raw as {
    enabled?: unknown
    logMaxBytes?: unknown
    virtualToolCallEnabled?: unknown
    extensionTemplateVfsSnapshot?: unknown
  }
  const logMaxBytes =
    typeof input.logMaxBytes === 'number' && Number.isFinite(input.logMaxBytes) && input.logMaxBytes > 0
      ? Math.floor(input.logMaxBytes)
      : DEFAULT_SETTINGS.logMaxBytes
  let extensionTemplateVfsSnapshot: VfsSnapshot | null = null
  if (input.extensionTemplateVfsSnapshot && typeof input.extensionTemplateVfsSnapshot === 'object') {
    try {
      extensionTemplateVfsSnapshot = parseVfsSnapshot(input.extensionTemplateVfsSnapshot as VfsSnapshot)
    } catch {
      extensionTemplateVfsSnapshot = null
    }
  }
  return {
    enabled: typeof input.enabled === 'boolean' ? input.enabled : DEFAULT_SETTINGS.enabled,
    logMaxBytes,
    virtualToolCallEnabled:
      typeof input.virtualToolCallEnabled === 'boolean'
        ? input.virtualToolCallEnabled
        : DEFAULT_SETTINGS.virtualToolCallEnabled,
    extensionTemplateVfsSnapshot,
  }
}

/** 写回 ST 前的纯字面量快照（扁平、可序列化） */
export function serializeVfsExtensionSettings(state: VfsExtensionSettings): Record<string, unknown> {
  return {
    enabled: Boolean(state.enabled),
    logMaxBytes: Number.isFinite(state.logMaxBytes) && state.logMaxBytes > 0 ? Math.floor(state.logMaxBytes) : DEFAULT_SETTINGS.logMaxBytes,
    virtualToolCallEnabled: Boolean(state.virtualToolCallEnabled),
    extensionTemplateVfsSnapshot: state.extensionTemplateVfsSnapshot
      ? serializeVfsSnapshot(state.extensionTemplateVfsSnapshot)
      : null,
  }
}
