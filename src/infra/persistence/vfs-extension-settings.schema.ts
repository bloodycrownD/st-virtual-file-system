import type { VfsSnapshot } from '@/domain/vfs/types'
import { parseVfsSnapshot, serializeVfsSnapshot } from '@/infra/persistence/vfs-snapshot.schema'

/**
 * Extension-level persistence schema for the VFS extension.
 *
 * This module defines the in-memory types and parse/serialize helpers for the data stored in
 * SillyTavern's global extension settings bucket (conceptually `extensionSettings[name]`).
 *
 * ## Chat vs extension persistence mapping
 * - **Extension settings (this module)**: global configuration shared by all chats (toggles, limits,
 *   and the template snapshot).
 * - **Chat metadata**: per-conversation state that changes when the user switches chats
 *   (see `vfs-chat-metadata.schema.ts`).
 *
 * Parsers are defensive and normalize unknown raw records into a safe, schema-consistent shape.
 */
export interface VfsExtensionSettings {
  enabled: boolean
  /**
   * Maximum size budget for the chat-scoped log list, in bytes (approximate).
   *
   * The log service enforces this by trimming the oldest entries first until the serialized log
   * payload fits under this budget.
   */
  logMaxBytes: number
  /**
   * Global virtual tool-call execution toggle.
   *
   * When disabled, call tags in messages should be treated as inert and will not execute tools.
   */
  virtualToolCallEnabled: boolean
  /**
   * Extension-scoped template snapshot used to initialize chat snapshots.
   *
   * On first access in a chat, `ExtensionVfsTemplateService` may clone this snapshot into
   * `chatVfsSnapshot` (chat metadata) and then mark that chat as initialized.
   */
  extensionTemplateVfsSnapshot: VfsSnapshot | null
}

/** Defaults used when no persisted settings exist (or when fields are missing/invalid). */
const DEFAULT_SETTINGS: VfsExtensionSettings = {
  enabled: true,
  logMaxBytes: 1024 * 1024,
  virtualToolCallEnabled: true,
  extensionTemplateVfsSnapshot: null,
}

/**
 * Parse a raw `extensionSettings[name]` record into normalized `VfsExtensionSettings`.
 *
 * - Missing or invalid fields fall back to defaults.
 * - Snapshot parsing failures degrade to `null` to keep runtime resilient.
 */
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

/**
 * Serialize normalized extension settings back into a JSON-friendly plain record.
 *
 * This is the write shape for SillyTavern persistence and is kept intentionally flat and
 * serializable.
 */
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
