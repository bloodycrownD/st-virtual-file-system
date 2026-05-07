/** 会话级（chatMetadata）扩展数据的形状；切聊天后会换数据源，由 store reload */
export interface VfsChatMetadata {
  mounted: boolean
}

/** 新会话或缺字段时的默认会话态（示例字段，可按业务扩展） */
const DEFAULT_CHAT_METADATA: VfsChatMetadata = {
  mounted: false,
}

/** chatMetadata[name] 原始对象 -> 内存中的规整结构 */
export function parseVfsChatMetadata(raw: unknown): VfsChatMetadata {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_CHAT_METADATA }
  }

  const input = raw as { mounted?: unknown }
  return {
    mounted: typeof input.mounted === 'boolean' ? input.mounted : DEFAULT_CHAT_METADATA.mounted,
  }
}

/** 写回 ST 前转成可序列化快照 */
export function serializeVfsChatMetadata(state: VfsChatMetadata): Record<string, boolean> {
  return {
    mounted: Boolean(state.mounted),
  }
}
