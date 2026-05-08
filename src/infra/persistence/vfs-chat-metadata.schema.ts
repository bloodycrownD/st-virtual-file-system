import type { VfsSnapshot } from '@/domain/vfs/types'
import {
  createEmptyVfsSnapshot,
  parseVfsSnapshot,
  serializeVfsSnapshot,
} from '@/infra/persistence/vfs-snapshot.schema'
import type { WorkTreeConfig } from '@/domain/work-tree/work-tree.types'
import { parseWorkTreeConfig, serializeWorkTreeConfig } from '@/domain/work-tree/work-tree.types'

/**
 * Chat-level persistence schema for the VFS extension.
 *
 * This module defines the in-memory types and parse/serialize helpers for the data stored in
 * SillyTavern's per-chat metadata bucket (conceptually `chatMetadata[name]`).
 *
 * ## Chat vs extension persistence mapping
 * - **Chat metadata (this module)**: per-conversation state that changes when the user switches chats
 *   (e.g. `chatVfsSnapshot`, logs, and commit history).
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

/** Commit origin classification used by version history. */
export type VfsCommitSource = 'tool' | 'manual' | 'system'
export type VfsCommitActionType = 'save' | 'rollback' | 'batch-rollback' | 'trace-rollback'

export interface VfsSourceVersionRef {
  id: string
  reason: 'rollback-target' | 'batch-rollback-target' | 'trace-target'
}

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
  commitId?: string
  toolName: string
  status: VfsLogStatus
  durationMs: number
  argsSummary: string
  errorCode?: string
  errorMessage?: string
}

/**
 * Lightweight commit metadata entry for chat-scoped history.
 *
 * This is intentionally small: it records *what* happened and *who/what* initiated it (source),
 * without embedding full VFS snapshot payloads.
 */
export interface ChatVfsVersionEntry {
  id: string
  /** Required by UI spec for timeline rendering. */
  time: string
  operator: string
  actionType: VfsCommitActionType
  scope: string
  sourceVersion?: VfsSourceVersionRef
  /**
   * Optional multi-source provenance for batch operations.
   * For batch rollback, `sourceVersion` points to the *applied* target (last snapshot),
   * while `sourceVersions` can retain the full ordered selection for auditability.
   */
  sourceVersions?: VfsSourceVersionRef[]
  /** Optional snapshot anchor for authoritative rollback application. */
  snapshot?: VfsSnapshot
  /**
   * Backward-compatible fields for pre-schema records/UI branches.
   * WHY: keep reads migration-safe while new writers move to spec fields.
   */
  timestamp?: number
  source?: VfsCommitSource
  summary?: string
  changedFiles?: string[]
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
  /** Append-only commit metadata list (tool/manual/system sources). */
  chatVfsVersions: ChatVfsVersionEntry[]
  /**
   * One-time initialization guard for template injection.
   *
   * If false, the runtime may attempt to initialize `chatVfsSnapshot` from an extension-level
   * template snapshot. Once initialization is attempted (even if no template exists), this flag
   * is set to true to make the operation idempotent per chat.
   */
  templateInitialized: boolean
  /** When null, `{{VIRTUAL_WORK_TREE}}` renders an empty string. */
  workTree: WorkTreeConfig | null
}

/** Default chat metadata used when missing/invalid data is encountered. */
const DEFAULT_CHAT_METADATA: VfsChatMetadata = {
  mounted: false,
  chatVfsSnapshot: createEmptyVfsSnapshot(),
  chatVfsLogs: [],
  chatVfsVersions: [],
  templateInitialized: false,
  workTree: null,
}

/**
 * Parse a raw `chatMetadata[name]` record into a normalized `VfsChatMetadata` object.
 *
 * - Missing or invalid fields fall back to defaults.
 * - Snapshot parsing failures degrade to an **empty** snapshot (not null).
 */
export function parseVfsChatMetadata(raw: unknown): VfsChatMetadata {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_CHAT_METADATA, chatVfsSnapshot: createEmptyVfsSnapshot() }
  }

  const input = raw as {
    mounted?: unknown
    chatVfsSnapshot?: unknown
    chatVfsLogs?: unknown
    chatVfsVersions?: unknown
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
  const toActionType = (value: unknown): VfsCommitActionType => {
    if (value === 'save' || value === 'rollback' || value === 'batch-rollback' || value === 'trace-rollback') {
      return value
    }
    return 'save'
  }

  const normalizeVersionEntry = (entry: unknown): ChatVfsVersionEntry | null => {
    if (!entry || typeof entry !== 'object') return null
    const rawEntry = entry as Record<string, unknown>
    const timestamp =
      typeof rawEntry.timestamp === 'number' && Number.isFinite(rawEntry.timestamp) ? rawEntry.timestamp : Date.now()
    const time = typeof rawEntry.time === 'string' && rawEntry.time ? rawEntry.time : new Date(timestamp).toISOString()
    const scopeFromLegacySummary = typeof rawEntry.summary === 'string' && rawEntry.summary ? rawEntry.summary : '*'
    const actionType = toActionType(rawEntry.actionType)
    const sourceVersionRaw =
      rawEntry.sourceVersion && typeof rawEntry.sourceVersion === 'object'
        ? (rawEntry.sourceVersion as Record<string, unknown>)
        : null

    const sourceVersion: VfsSourceVersionRef | undefined =
      sourceVersionRaw && typeof sourceVersionRaw.id === 'string' && sourceVersionRaw.id
        ? {
            id: sourceVersionRaw.id,
            reason:
              sourceVersionRaw.reason === 'rollback-target' ||
              sourceVersionRaw.reason === 'batch-rollback-target' ||
              sourceVersionRaw.reason === 'trace-target'
                ? sourceVersionRaw.reason
                : ('rollback-target' as const),
          }
        : undefined
    let snapshot: VfsSnapshot | undefined
    if (rawEntry.snapshot && typeof rawEntry.snapshot === 'object') {
      try {
        snapshot = parseVfsSnapshot(rawEntry.snapshot as VfsSnapshot)
      } catch {
        snapshot = undefined
      }
    }

    return {
      id: typeof rawEntry.id === 'string' && rawEntry.id ? rawEntry.id : `commit-${timestamp}`,
      time,
      operator: typeof rawEntry.operator === 'string' && rawEntry.operator ? rawEntry.operator : 'system',
      actionType,
      scope: typeof rawEntry.scope === 'string' && rawEntry.scope ? rawEntry.scope : scopeFromLegacySummary,
      sourceVersion,
      snapshot,
      timestamp,
      source:
        rawEntry.source === 'tool' || rawEntry.source === 'manual' || rawEntry.source === 'system'
          ? rawEntry.source
          : 'manual',
      summary: typeof rawEntry.summary === 'string' ? rawEntry.summary : scopeFromLegacySummary,
      changedFiles: Array.isArray(rawEntry.changedFiles)
        ? (rawEntry.changedFiles.filter((item) => typeof item === 'string') as string[])
        : [],
    }
  }

  const chatVfsVersions = Array.isArray(input.chatVfsVersions)
    ? input.chatVfsVersions.map((entry) => normalizeVersionEntry(entry)).filter((entry): entry is ChatVfsVersionEntry => !!entry)
    : []

  const workTree = parseWorkTreeConfig(input.workTree)

  return {
    mounted: typeof input.mounted === 'boolean' ? input.mounted : DEFAULT_CHAT_METADATA.mounted,
    chatVfsSnapshot,
    chatVfsLogs,
    chatVfsVersions,
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
 */
export function serializeVfsChatMetadata(state: VfsChatMetadata): Record<string, unknown> {
  return {
    mounted: Boolean(state.mounted),
    chatVfsSnapshot: serializeVfsSnapshot(state.chatVfsSnapshot),
    chatVfsLogs: [...state.chatVfsLogs],
    chatVfsVersions: [...state.chatVfsVersions],
    templateInitialized: Boolean(state.templateInitialized),
    workTree: state.workTree ? serializeWorkTreeConfig(state.workTree) : null,
  }
}
