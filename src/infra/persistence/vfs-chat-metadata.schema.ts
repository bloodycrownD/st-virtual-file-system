import type { VfsSnapshot } from '@/domain/vfs/types'
import type { ChatVfsSnapshotRecord, VfsPathSnapshotEntry } from '@/domain/vfs-snapshot/vfs-snapshot-types'
import {
  createEmptyVfsSnapshot,
  parseVfsSnapshot,
  serializeVfsSnapshot,
} from '@/infra/persistence/vfs-snapshot.schema'
import type { WorkTreeConfig } from '@/domain/work-tree/work-tree.types'
import { parseWorkTreeConfig, serializeWorkTreeConfig } from '@/domain/work-tree/work-tree.types'

export type { ChatVfsSnapshotRecord, VfsPathSnapshotEntry } from '@/domain/vfs-snapshot/vfs-snapshot-types'

/**
 * Chat-level persistence schema for the VFS extension.
 *
 * This module defines the in-memory types and parse/serialize helpers for the data stored in
 * SillyTavern's per-chat metadata bucket (conceptually `chatMetadata[name]`).
 *
 * ## Chat vs extension persistence mapping
 * - **Chat metadata (this module)**: per-conversation state that changes when the user switches chats
 *   (e.g. `chatVfsSnapshot`, logs, and snapshot manifest history).
 * - **Extension settings**: global configuration shared by all chats (see `vfs-extension-settings.schema.ts`).
 *
 * The parser functions are defensive: unknown or malformed shapes fall back to safe defaults so a
 * corrupted persistence record does not break runtime behavior.
 *
 * ## Snapshot invariant
 * After normalization, `chatVfsSnapshot` is always a valid `VfsSnapshot` (at minimum an empty tree).
 * Persisted `null`/parse failures are coerced to `createEmptyVfsSnapshot()` so macros and runtime do
 * not branch on a long-lived missing tree.
 */
export type VfsLogStatus = 'success' | 'failed' | 'timeout' | 'skipped'

/**
 * Structured log entry for a tool execution (or tool batch).
 *
 * Stored per-chat so diagnostics stay scoped to a conversation and can be trimmed independently.
 */
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
  /** Reference into `chatVfsSnapshots[].id` when a pre-batch manifest exists for rollback. */
  snapshotId?: string
}

/**
 * Shape of the VFS extension data stored in chat metadata.
 *
 * When the user switches chats, the data source changes and the persistence store reloads this
 * structure from the newly active chat's metadata record.
 */
export interface VfsChatMetadata {
  mounted: boolean
  /**
   * The persisted chat VFS snapshot (always non-null after parse; minimum empty root tree).
   *
   * Runtime services treat this as the durable state. Tool execution uses a working copy and only
   * writes back a new snapshot on successful completion of a full batch (persist-on-success).
   */
  chatVfsSnapshot: VfsSnapshot
  /** Chat-scoped diagnostic logs (subject to byte-based trimming). */
  chatVfsLogs: ChatVfsLogEntry[]
  /**
   * Path manifest snapshots for rollback (FIFO-capped by extension `snapshotMaxCount`).
   * WHY: separated from logs — logs only store `snapshotId`, not manifest payloads.
   */
  chatVfsSnapshots: ChatVfsSnapshotRecord[]
  /**
   * One-time initialization guard for template injection.
   *
   * If false, the runtime may attempt to initialize `chatVfsSnapshot` from an extension-level
   * template snapshot. Once initialization is attempted (even if no template exists), this flag
   * is set to true to make the operation idempotent per chat.
   */
  templateInitialized: boolean
  /**
   * Persisted v2 work tree; `null` means “not yet written / legacy rejected at parse”.
   * Runtime renders macros using the same defaults as UI (`ensureWorkTreeConfig`), so `null` does
   * not imply an empty `{{VIRTUAL_WORK_TREE}}` when files exist under default root rules.
   */
  workTree: WorkTreeConfig | null
}

/** Default chat metadata used when missing/invalid data is encountered. */
const DEFAULT_CHAT_METADATA: VfsChatMetadata = {
  mounted: false,
  chatVfsSnapshot: createEmptyVfsSnapshot(),
  chatVfsLogs: [],
  chatVfsSnapshots: [],
  templateInitialized: false,
  workTree: null,
}

function parsePathSnapshotEntry(raw: unknown): VfsPathSnapshotEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const path = typeof o.path === 'string' ? o.path : ''
  if (!path) return null
  const presence = o.presence === 'absent' || o.presence === 'present' ? o.presence : null
  if (!presence) return null
  if (presence === 'absent') {
    return { path, presence: 'absent' }
  }
  if (!o.subtree || typeof o.subtree !== 'object') return null
  try {
    const subtree = parseVfsSnapshot(o.subtree as VfsSnapshot)
    return { path, presence: 'present', subtree }
  } catch {
    return null
  }
}

function parseSnapshotRecord(raw: unknown): ChatVfsSnapshotRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const id = typeof o.id === 'string' && o.id ? o.id : null
  const time = typeof o.time === 'string' && o.time ? o.time : null
  const kind = o.kind === 'manual' || o.kind === 'tool-batch-pre' ? o.kind : null
  if (!id || !time || !kind) return null
  const entriesRaw = Array.isArray(o.entries) ? o.entries : []
  const entries = entriesRaw.map((e) => parsePathSnapshotEntry(e)).filter((e): e is VfsPathSnapshotEntry => !!e)
  if (entries.length === 0) return null
  return { id, time, kind, entries }
}

/**
 * Parse a raw `chatMetadata[name]` record into a normalized `VfsChatMetadata` object.
 *
 * - Missing or invalid fields fall back to defaults.
 * - Snapshot parsing failures degrade to an **empty** snapshot (not null).
 * - Legacy `chatVfsVersions` is ignored on read (complete migration; no dual-write).
 */
export function parseVfsChatMetadata(raw: unknown): VfsChatMetadata {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_CHAT_METADATA, chatVfsSnapshot: createEmptyVfsSnapshot() }
  }

  const input = raw as {
    mounted?: unknown
    chatVfsSnapshot?: unknown
    chatVfsLogs?: unknown
    chatVfsSnapshots?: unknown
    templateInitialized?: unknown
    workTree?: unknown
  }

  let chatVfsSnapshot = createEmptyVfsSnapshot()
  if (input.chatVfsSnapshot && typeof input.chatVfsSnapshot === 'object') {
    try {
      chatVfsSnapshot = parseVfsSnapshot(input.chatVfsSnapshot as VfsSnapshot)
    } catch {
      chatVfsSnapshot = createEmptyVfsSnapshot()
    }
  }

  const chatVfsLogs = Array.isArray(input.chatVfsLogs) ? (input.chatVfsLogs as ChatVfsLogEntry[]).filter(Boolean) : []

  const chatVfsSnapshots = Array.isArray(input.chatVfsSnapshots)
    ? input.chatVfsSnapshots.map((row) => parseSnapshotRecord(row)).filter((row): row is ChatVfsSnapshotRecord => !!row)
    : []

  const workTree = parseWorkTreeConfig(input.workTree)

  return {
    mounted: typeof input.mounted === 'boolean' ? input.mounted : DEFAULT_CHAT_METADATA.mounted,
    chatVfsSnapshot,
    chatVfsLogs,
    chatVfsSnapshots,
    templateInitialized:
      typeof input.templateInitialized === 'boolean'
        ? input.templateInitialized
        : DEFAULT_CHAT_METADATA.templateInitialized,
    workTree,
  }
}

/**
 * Serialize normalized chat metadata back into a JSON-friendly plain record.
 *
 * This should be used as the write shape to SillyTavern so persisted content remains stable and
 * schema-compatible (including future migrations/default backfills).
 * WHY: `chatVfsVersions` is intentionally omitted — writers must not resurrect legacy commit storage.
 */
export function serializeVfsChatMetadata(state: VfsChatMetadata): Record<string, unknown> {
  return {
    mounted: Boolean(state.mounted),
    chatVfsSnapshot: serializeVfsSnapshot(state.chatVfsSnapshot),
    chatVfsLogs: [...state.chatVfsLogs],
    chatVfsSnapshots: state.chatVfsSnapshots.map((rec) => ({
      ...rec,
      entries: rec.entries.map((e) =>
        e.presence === 'present' && e.subtree
          ? { path: e.path, presence: e.presence, subtree: serializeVfsSnapshot(e.subtree) }
          : { path: e.path, presence: e.presence },
      ),
    })),
    templateInitialized: Boolean(state.templateInitialized),
    workTree: state.workTree ? serializeWorkTreeConfig(state.workTree) : null,
  }
}
