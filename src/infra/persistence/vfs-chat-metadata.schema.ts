import type { VfsSnapshot } from '@/domain/vfs/types'
import { parseVfsSnapshot, serializeVfsSnapshot } from '@/infra/persistence/vfs-snapshot.schema'

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
 */
export type VfsLogStatus = 'success' | 'failed' | 'timeout' | 'skipped'

/** Commit origin classification used by version history. */
export type VfsCommitSource = 'tool' | 'manual' | 'system'

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
  timestamp: number
  source: VfsCommitSource
  summary: string
  changedFiles: string[]
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
   * The persisted chat VFS snapshot.
   *
   * Runtime services treat this as the durable state. Tool execution uses a working copy and only
   * writes back a new snapshot on successful completion of a full batch (persist-on-success).
   */
  chatVfsSnapshot: VfsSnapshot | null
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
}

/** Default chat metadata used when missing/invalid data is encountered. */
const DEFAULT_CHAT_METADATA: VfsChatMetadata = {
  mounted: false,
  chatVfsSnapshot: null,
  chatVfsLogs: [],
  chatVfsVersions: [],
  templateInitialized: false,
}

/**
 * Parse a raw `chatMetadata[name]` record into a normalized `VfsChatMetadata` object.
 *
 * - Missing or invalid fields fall back to defaults.
 * - Snapshot parsing failures degrade to `null` (rather than throwing), preventing bad persistence
 *   data from poisoning runtime state.
 */
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

  // 快照解析失败时回退 null，避免脏结构污染运行时。
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

/**
 * Serialize normalized chat metadata back into a JSON-friendly plain record.
 *
 * This should be used as the write shape to SillyTavern so persisted content remains stable and
 * schema-compatible (including future migrations/default backfills).
 */
export function serializeVfsChatMetadata(state: VfsChatMetadata): Record<string, unknown> {
  return {
    mounted: Boolean(state.mounted),
    chatVfsSnapshot: state.chatVfsSnapshot ? serializeVfsSnapshot(state.chatVfsSnapshot) : null,
    chatVfsLogs: [...state.chatVfsLogs],
    chatVfsVersions: [...state.chatVfsVersions],
    templateInitialized: Boolean(state.templateInitialized),
  }
}
