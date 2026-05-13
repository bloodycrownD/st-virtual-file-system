import type { VfsSnapshot } from '@/domain/vfs/types'
import {
  createEmptyVfsSnapshot,
  parseVfsSnapshot,
  serializeVfsSnapshot,
} from '@/infra/persistence/vfs-snapshot.schema'
import type { WorkTreeConfig } from '@/domain/work-tree/work-tree.types'
import { parseWorkTreeConfig, serializeWorkTreeConfig } from '@/domain/work-tree/work-tree.types'
import {
  parseVfsCheckpoints,
  parseVfsPathVersionStore,
  serializeVfsCheckpoints,
  serializeVfsPathVersionStore,
  type VfsCheckpointRecord,
  type VfsPathVersionStore,
} from '@/infra/persistence/vfs-checkpoint.schema'

/**
 * Chat-level persistence schema for the VFS extension.
 *
 * ## v2 persistence (`vfsChatPersistenceVersion === 2`)
 * - **Authoritative tree**: `chatVfsSnapshot` remains the single runtime/UI source of truth.
 * - **Rollback**: path version store + sparse post-commit checkpoints (`vfsCheckpoints`).
 *
 * ## Destructive upgrade
 * Legacy `chatVfsSnapshots` / `snapshotId` are stripped on parse and never serialized again.
 */
export type VfsLogStatus = 'success' | 'failed' | 'timeout' | 'skipped'

export interface ChatVfsLogEntry {
  id: string
  timestamp: number
  chatId: string
  messageId: string
  batchId: string
  toolName: string
  status: VfsLogStatus
  durationMs: number
  argsSummary: string
  errorCode?: string
  errorMessage?: string
  /** Present when this log row was written alongside a persisted post-commit checkpoint. */
  checkpointId?: string
}

export const VFS_CHAT_PERSISTENCE_VERSION = 2 as const

export interface VfsChatMetadata {
  /** `2` is the current on-disk revision for this extension build. */
  vfsChatPersistenceVersion: typeof VFS_CHAT_PERSISTENCE_VERSION
  mounted: boolean
  chatVfsSnapshot: VfsSnapshot
  chatVfsLogs: ChatVfsLogEntry[]
  vfsPathVersionStore: VfsPathVersionStore
  vfsCheckpoints: VfsCheckpointRecord[]
  templateInitialized: boolean
  workTree: WorkTreeConfig | null
}

const DEFAULT_CHAT_METADATA: VfsChatMetadata = {
  vfsChatPersistenceVersion: VFS_CHAT_PERSISTENCE_VERSION,
  mounted: false,
  chatVfsSnapshot: createEmptyVfsSnapshot(),
  chatVfsLogs: [],
  vfsPathVersionStore: {},
  vfsCheckpoints: [],
  templateInitialized: false,
  workTree: null,
}

function stripLegacyLogFields(entries: ChatVfsLogEntry[]): ChatVfsLogEntry[] {
  return entries.map((row) => {
    const clone: ChatVfsLogEntry = { ...row }
    delete (clone as { snapshotId?: string }).snapshotId
    return clone
  })
}

function rawHadLegacySnapshots(raw: Record<string, unknown>): boolean {
  const snaps = raw.chatVfsSnapshots
  return Array.isArray(snaps) && snaps.length > 0
}

function readRawPersistenceVersion(raw: Record<string, unknown>): number | undefined {
  const v = raw.vfsChatPersistenceVersion
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

/**
 * Parse a raw `chatMetadata[name]` record into a normalized `VfsChatMetadata` object.
 *
 * Destructive upgrade: if `vfsChatPersistenceVersion !== 2` **or** legacy `chatVfsSnapshots` is
 * non-empty, old manifests are ignored and checkpoint/version store are reset to empty (logs keep
 * text fields but `snapshotId` is stripped).
 */
export function parseVfsChatMetadata(raw: unknown): VfsChatMetadata {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_CHAT_METADATA, chatVfsSnapshot: createEmptyVfsSnapshot() }
  }

  const input = raw as Record<string, unknown>

  let chatVfsSnapshot = createEmptyVfsSnapshot()
  if (input.chatVfsSnapshot && typeof input.chatVfsSnapshot === 'object') {
    try {
      chatVfsSnapshot = parseVfsSnapshot(input.chatVfsSnapshot as VfsSnapshot)
    } catch {
      chatVfsSnapshot = createEmptyVfsSnapshot()
    }
  }

  const logsRaw = Array.isArray(input.chatVfsLogs) ? (input.chatVfsLogs as ChatVfsLogEntry[]).filter(Boolean) : []
  const chatVfsLogs = stripLegacyLogFields(logsRaw)

  const workTree = parseWorkTreeConfig(input.workTree)

  const rawVersion = readRawPersistenceVersion(input)
  const legacyTaint = rawVersion !== VFS_CHAT_PERSISTENCE_VERSION || rawHadLegacySnapshots(input)

  let vfsPathVersionStore: VfsPathVersionStore = {}
  let vfsCheckpoints: VfsCheckpointRecord[] = []
  if (!legacyTaint) {
    vfsPathVersionStore = parseVfsPathVersionStore(input.vfsPathVersionStore)
    vfsCheckpoints = parseVfsCheckpoints(input.vfsCheckpoints)
  }

  return {
    vfsChatPersistenceVersion: VFS_CHAT_PERSISTENCE_VERSION,
    mounted: typeof input.mounted === 'boolean' ? input.mounted : DEFAULT_CHAT_METADATA.mounted,
    chatVfsSnapshot,
    chatVfsLogs,
    vfsPathVersionStore,
    vfsCheckpoints,
    templateInitialized:
      typeof input.templateInitialized === 'boolean'
        ? input.templateInitialized
        : DEFAULT_CHAT_METADATA.templateInitialized,
    workTree,
  }
}

export function serializeVfsChatMetadata(state: VfsChatMetadata): Record<string, unknown> {
  return {
    vfsChatPersistenceVersion: VFS_CHAT_PERSISTENCE_VERSION,
    mounted: Boolean(state.mounted),
    chatVfsSnapshot: serializeVfsSnapshot(state.chatVfsSnapshot),
    chatVfsLogs: state.chatVfsLogs.map((row) => ({ ...row })),
    vfsPathVersionStore: serializeVfsPathVersionStore(state.vfsPathVersionStore),
    vfsCheckpoints: serializeVfsCheckpoints(state.vfsCheckpoints),
    templateInitialized: Boolean(state.templateInitialized),
    workTree: state.workTree ? serializeWorkTreeConfig(state.workTree) : null,
  }
}
