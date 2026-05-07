import type { VfsSnapshot } from '@/domain/vfs/types'
import { parseVfsSnapshot, serializeVfsSnapshot } from '@/infra/persistence/vfs-snapshot.schema'

export type VfsLogStatus = 'success' | 'failed' | 'timeout' | 'skipped'
export type VfsCommitSource = 'tool' | 'manual' | 'system'

export interface ChatVfsLogEntry {
  id: string
  timestamp: number
  chatId: string
  messageId: string
  batchId: string
  commitId?: string
  toolName: string
  status: VfsLogStatus
  durationMs: number
  argsSummary: string
  errorCode?: string
  errorMessage?: string
}

export interface ChatVfsVersionEntry {
  id: string
  timestamp: number
  source: VfsCommitSource
  summary: string
  changedFiles: string[]
}

/** 会话级（chatMetadata）扩展数据的形状；切聊天后会换数据源，由 store reload */
export interface VfsChatMetadata {
  mounted: boolean
  chatVfsSnapshot: VfsSnapshot | null
  chatVfsLogs: ChatVfsLogEntry[]
  chatVfsVersions: ChatVfsVersionEntry[]
  templateInitialized: boolean
}

/** 新会话或缺字段时的默认会话态（示例字段，可按业务扩展） */
const DEFAULT_CHAT_METADATA: VfsChatMetadata = {
  mounted: false,
  chatVfsSnapshot: null,
  chatVfsLogs: [],
  chatVfsVersions: [],
  templateInitialized: false,
}

/** chatMetadata[name] 原始对象 -> 内存中的规整结构 */
export function parseVfsChatMetadata(raw: unknown): VfsChatMetadata {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_CHAT_METADATA }
  }

  const input = raw as {
    mounted?: unknown
    chatVfsSnapshot?: unknown
    chatVfsLogs?: unknown
    chatVfsVersions?: unknown
    templateInitialized?: unknown
  }

  let chatVfsSnapshot: VfsSnapshot | null = null
  if (input.chatVfsSnapshot && typeof input.chatVfsSnapshot === 'object') {
    try {
      chatVfsSnapshot = parseVfsSnapshot(input.chatVfsSnapshot as VfsSnapshot)
    } catch {
      chatVfsSnapshot = null
    }
  }

  const chatVfsLogs = Array.isArray(input.chatVfsLogs) ? (input.chatVfsLogs as ChatVfsLogEntry[]).filter(Boolean) : []
  const chatVfsVersions = Array.isArray(input.chatVfsVersions)
    ? (input.chatVfsVersions as ChatVfsVersionEntry[]).filter(Boolean)
    : []

  return {
    mounted: typeof input.mounted === 'boolean' ? input.mounted : DEFAULT_CHAT_METADATA.mounted,
    chatVfsSnapshot,
    chatVfsLogs,
    chatVfsVersions,
    templateInitialized:
      typeof input.templateInitialized === 'boolean'
        ? input.templateInitialized
        : DEFAULT_CHAT_METADATA.templateInitialized,
  }
}

/** 写回 ST 前转成可序列化快照 */
export function serializeVfsChatMetadata(state: VfsChatMetadata): Record<string, unknown> {
  return {
    mounted: Boolean(state.mounted),
    chatVfsSnapshot: state.chatVfsSnapshot ? serializeVfsSnapshot(state.chatVfsSnapshot) : null,
    chatVfsLogs: [...state.chatVfsLogs],
    chatVfsVersions: [...state.chatVfsVersions],
    templateInitialized: Boolean(state.templateInitialized),
  }
}
