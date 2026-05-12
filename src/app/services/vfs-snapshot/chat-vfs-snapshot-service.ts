import { VfsCore } from '@/domain/vfs/vfs-core'
import type { VfsSnapshot } from '@/domain/vfs/types'
import type { ContentCodec } from '@/infra/serialization/content-codec'
import type { VfsPersistenceStore } from '@/app/stores/vfs-persistence-store'
import type { ChatVfsSnapshotRecord } from '@/domain/vfs-snapshot/vfs-snapshot-types'
import { diffVfsSnapshotPaths } from '@/domain/vfs-snapshot/vfs-snapshot-diff'
import { applyManifestEntriesToCore, buildManifestEntriesFromBefore } from '@/domain/vfs-snapshot/vfs-snapshot-manifest'
import { normalizePath, ROOT_PATH } from '@/domain/vfs/path-utils'
import { serializeVfsSnapshot } from '@/infra/persistence/vfs-snapshot.schema'

function newSnapshotId(): string {
  return `snap-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
}

function fifoTrim(snapshots: ChatVfsSnapshotRecord[], maxCount: number): ChatVfsSnapshotRecord[] {
  if (snapshots.length <= maxCount) return snapshots
  // WHY: FIFO — drop oldest manifests when over cap (independent from log byte trimming).
  return snapshots.slice(snapshots.length - maxCount)
}

export class ChatVfsSnapshotService {
  constructor(
    private readonly store: VfsPersistenceStore,
    private readonly codec: ContentCodec,
  ) {}

  /**
   * Build a tool-batch pre manifest from `before` at affected paths; returns `null` when diff is empty.
   */
  buildToolBatchPreRecord(before: VfsSnapshot, after: VfsSnapshot): ChatVfsSnapshotRecord | null {
    const changed = diffVfsSnapshotPaths(before, after)
    if (changed.length === 0) return null
    const entries = buildManifestEntriesFromBefore(before, changed)
    return {
      id: newSnapshotId(),
      time: new Date().toISOString(),
      kind: 'tool-batch-pre',
      entries,
    }
  }

  /** Manual snapshot for a single path (default editor file), anchored to the current persisted tree. */
  buildManualRecordForPath(before: VfsSnapshot, path: string): ChatVfsSnapshotRecord {
    const normalized = normalizePath(path)
    if (normalized === ROOT_PATH) {
      throw new Error('Manual snapshot path cannot be root')
    }
    const entries = buildManifestEntriesFromBefore(before, [normalized])
    return {
      id: newSnapshotId(),
      time: new Date().toISOString(),
      kind: 'manual',
      entries,
    }
  }

  /** Persist a manual manifest for `path` against the current authoritative chat snapshot. */
  persistManualSnapshotForPath(path: string): string {
    const chat = this.store.getState().chat
    const record = this.buildManualRecordForPath(chat.chatVfsSnapshot, path)
    this.store.updateChat((draft) => ({
      ...draft,
      chatVfsSnapshots: this.mergeIntoChatSnapshots(draft.chatVfsSnapshots, record),
    }))
    return record.id
  }

  mergeIntoChatSnapshots(existing: ChatVfsSnapshotRecord[], record: ChatVfsSnapshotRecord): ChatVfsSnapshotRecord[] {
    const max = this.store.getState().extension.snapshotMaxCount
    return fifoTrim([...existing, record], max)
  }

  /**
   * Apply a stored manifest to the current chat snapshot and persist once.
   * WHY: atomic rollback — validate + mutate in-memory; only `updateChat` after a successful export.
   */
  applySnapshotById(snapshotId: string): { ok: true } | { ok: false; errorCode: string; message: string } {
    const chat = this.store.getState().chat
    const record = chat.chatVfsSnapshots.find((row) => row.id === snapshotId)
    if (!record) {
      return { ok: false, errorCode: 'SNAPSHOT_NOT_FOUND', message: 'Snapshot is unavailable (missing or evicted).' }
    }
    const working = new VfsCore(this.codec)
    try {
      working.importSnapshot(serializeVfsSnapshot(chat.chatVfsSnapshot))
      applyManifestEntriesToCore(working, record.entries)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false, errorCode: 'SNAPSHOT_APPLY_FAILED', message }
    }
    const nextSnapshot = working.exportSnapshot()
    this.store.updateChat((draft) => ({ ...draft, chatVfsSnapshot: nextSnapshot }))
    return { ok: true }
  }
}
