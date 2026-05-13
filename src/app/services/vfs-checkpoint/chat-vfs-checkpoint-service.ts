/**
 * @file Post-commit sparse checkpoints + per-path version store for chat VFS rollback.
 *
 * Responsibilities:
 * - Append **post-commit** checkpoints after successful tool batches (`mergePostCommitCheckpoint`) and editor saves.
 * - Apply rollback by validating parent chains, then materializing from an empty `VfsCore` into `chatVfsSnapshot`.
 * - Enforce `snapshotMaxCount` FIFO on checkpoints and **sweep** version rows not referenced by any retained checkpoint.
 *
 * Non-responsibilities:
 * - Legacy `chatVfsSnapshots` / `snapshotId` manifests are stripped at parse time (`parseVfsChatMetadata`), not migrated here.
 */
import { VfsCore } from '@/domain/vfs/vfs-core'
import type { VfsFileNodeSnapshot, VfsNodeSnapshot, VfsSnapshot } from '@/domain/vfs/types'
import type { ContentCodec } from '@/infra/serialization/content-codec'
import type { VfsPersistenceStore } from '@/app/stores/vfs-persistence-store'
import { dirname, normalizePath, ROOT_PATH } from '@/domain/vfs/path-utils'
import { createEmptyVfsSnapshot } from '@/infra/persistence/vfs-snapshot.schema'
import type {
  VfsCheckpointRecord,
  VfsCheckpointSource,
  VfsPathVersionEntry,
  VfsPathVersionStore,
} from '@/infra/persistence/vfs-checkpoint.schema'
import type { ChatVfsLogEntry, VfsChatMetadata } from '@/infra/persistence/vfs-chat-metadata.schema'
import { trimChatVfsLogsByBytes } from '@/app/services/vfs-log/chat-vfs-log-service'

function newStableId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
}

function pathDepth(path: string): number {
  if (path === ROOT_PATH) return 0
  return path.split('/').filter(Boolean).length
}

function collectMaterializedPaths(snapshot: VfsSnapshot): string[] {
  const set = new Set<string>()
  for (const node of Object.values(snapshot.nodes)) {
    if (node.path === ROOT_PATH) continue
    set.add(normalizePath(node.path))
  }
  return [...set].sort((a, b) => pathDepth(a) - pathDepth(b) || a.localeCompare(b))
}

function getNodeAtPath(snapshot: VfsSnapshot, path: string): VfsNodeSnapshot | null {
  const p = normalizePath(path)
  for (const node of Object.values(snapshot.nodes)) {
    if (normalizePath(node.path) === p) return node
  }
  return null
}

function clonePathVersionStore(store: VfsPathVersionStore): VfsPathVersionStore {
  const out: VfsPathVersionStore = {}
  for (const [p, chain] of Object.entries(store)) {
    out[p] = chain.map((e) => ({
      ...e,
      content: e.content ? { ...e.content } : undefined,
    }))
  }
  return out
}

function appendVersionForPath(
  store: VfsPathVersionStore,
  path: string,
  entry: VfsPathVersionEntry,
): VfsPathVersionStore {
  const next = clonePathVersionStore(store)
  const prev = next[path] ?? []
  next[path] = [...prev, entry]
  return next
}

function fifoTrimCheckpoints<T>(rows: T[], maxCount: number): T[] {
  if (rows.length <= maxCount) return rows
  return rows.slice(rows.length - maxCount)
}

function sweepOrphanVersions(store: VfsPathVersionStore, checkpoints: VfsCheckpointRecord[]): VfsPathVersionStore {
  const referenced = new Set<string>()
  for (const cp of checkpoints) {
    for (const vid of Object.values(cp.treeVersion)) referenced.add(vid)
  }
  const next: VfsPathVersionStore = {}
  for (const [p, chain] of Object.entries(store)) {
    const kept = chain.filter((e) => referenced.has(e.versionId))
    if (kept.length > 0) next[p] = kept
  }
  return next
}

function validateParentChainForCheckpoint(
  treeVersion: Record<string, string>,
  store: VfsPathVersionStore,
): { ok: true } | { ok: false; message: string } {
  for (const [path, versionId] of Object.entries(treeVersion)) {
    const entry = store[path]?.find((e) => e.versionId === versionId) ?? null
    if (!entry) {
      return { ok: false, message: `Missing version row for ${path} (${versionId})` }
    }
    if (entry.kind === 'file') {
      let cursor = dirname(path)
      while (cursor !== ROOT_PATH) {
        const parentVid = treeVersion[cursor]
        if (!parentVid) {
          return { ok: false, message: `Parent chain incomplete for file ${path} (missing ${cursor})` }
        }
        const parentEntry = store[cursor]?.find((e) => e.versionId === parentVid) ?? null
        if (!parentEntry || parentEntry.kind !== 'directory') {
          return { ok: false, message: `Parent ${cursor} for ${path} is not a directory version` }
        }
        cursor = dirname(cursor)
      }
    } else if (entry.kind === 'directory' && path !== ROOT_PATH) {
      const parent = dirname(path)
      if (parent !== ROOT_PATH) {
        const parentVid = treeVersion[parent]
        if (!parentVid) {
          return { ok: false, message: `Parent chain incomplete for directory ${path} (missing ${parent})` }
        }
        const parentEntry = store[parent]?.find((e) => e.versionId === parentVid) ?? null
        if (!parentEntry || parentEntry.kind !== 'directory') {
          return { ok: false, message: `Parent ${parent} for directory ${path} is not a directory version` }
        }
      }
    }
  }
  return { ok: true }
}

export class ChatVfsCheckpointService {
  constructor(
    private readonly store: VfsPersistenceStore,
    private readonly codec: ContentCodec,
  ) {}

  /**
   * Append a post-commit sparse checkpoint for the **current** `draft.chatVfsSnapshot` tree.
   * WHY: callers typically compute `afterSnapshot` first, assign it onto `draft`, then merge checkpoint rows.
   */
  mergePostCommitCheckpoint(
    draft: VfsChatMetadata,
    afterSnapshot: VfsSnapshot,
    source: VfsCheckpointSource,
  ): { vfsPathVersionStore: VfsPathVersionStore; vfsCheckpoints: VfsCheckpointRecord[]; checkpointId: string } {
    const max = this.store.getState().extension.snapshotMaxCount
    const checkpointId = newStableId('cp')
    const time = new Date().toISOString()
    const treeVersion: Record<string, string> = {}
    let store = clonePathVersionStore(draft.vfsPathVersionStore)

    for (const path of collectMaterializedPaths(afterSnapshot)) {
      const node = getNodeAtPath(afterSnapshot, path)
      if (!node) continue
      const versionId = newStableId('pv')
      const createdAt = time
      if (node.type === 'directory') {
        const entry: VfsPathVersionEntry = { versionId, kind: 'directory', createdAt }
        store = appendVersionForPath(store, path, entry)
        treeVersion[path] = versionId
      } else {
        const fileNode = node as VfsFileNodeSnapshot
        const entry: VfsPathVersionEntry = {
          versionId,
          kind: 'file',
          content: { ...fileNode.content },
          updatedBy: fileNode.updatedBy,
          createdAt,
        }
        store = appendVersionForPath(store, path, entry)
        treeVersion[path] = versionId
      }
    }

    const record: VfsCheckpointRecord = { id: checkpointId, time, source, treeVersion }
    const chainOk = validateParentChainForCheckpoint(record.treeVersion, store)
    if (!chainOk.ok) {
      // WHY: should be impossible for internally exported snapshots; fail fast rather than persisting corrupt checkpoints.
      throw new Error(`Checkpoint parent validation failed: ${chainOk.message}`)
    }

    let checkpoints = [...draft.vfsCheckpoints, record]
    checkpoints = fifoTrimCheckpoints(checkpoints, max)
    store = sweepOrphanVersions(store, checkpoints)
    return { vfsPathVersionStore: store, vfsCheckpoints: checkpoints, checkpointId }
  }

  /**
   * Convenience: append a checkpoint for whatever tree is already persisted in the store.
   */
  appendCheckpointForPersistedTree(source: VfsCheckpointSource): string {
    let checkpointId = ''
    this.store.updateChat((draft) => {
      const merged = this.mergePostCommitCheckpoint(draft, draft.chatVfsSnapshot, source)
      checkpointId = merged.checkpointId
      return {
        ...draft,
        vfsPathVersionStore: merged.vfsPathVersionStore,
        vfsCheckpoints: merged.vfsCheckpoints,
      }
    })
    return checkpointId
  }

  /**
   * Editor save: write file into the authoritative snapshot and append a post-save checkpoint in one `updateChat`.
   *
   * WHY: SPEC requires successful **save** rows to carry `checkpointId` alongside persisted checkpoints (same atomic write
   * as tool batches with `logContext`), so `VfsHistoryScreen` can audit and roll back editor-committed states.
   */
  persistEditorSaveWithCheckpoint(path: string, content: string): string {
    let checkpointId = ''
    this.store.updateChat((draft) => {
      const core = new VfsCore(this.codec)
      core.importSnapshot(draft.chatVfsSnapshot)
      core.writeFile(path, content, { updatedBy: 'user' })
      const after = core.exportSnapshot()
      const merged = this.mergePostCommitCheckpoint({ ...draft, chatVfsSnapshot: after }, after, 'editor-save')
      checkpointId = merged.checkpointId
      const logTimestamp = Date.now()
      const maxBytes = this.store.getState().extension.logMaxBytes
      const saveLog: ChatVfsLogEntry = {
        id: `log-${logTimestamp}-editor-save`,
        timestamp: logTimestamp,
        chatId: 'local-chat',
        messageId: 'editor-save',
        batchId: `save-${logTimestamp}`,
        toolName: 'save',
        status: 'success',
        durationMs: 0,
        argsSummary: `path=${path}`,
        checkpointId,
      }
      const chatVfsLogs = trimChatVfsLogsByBytes([...draft.chatVfsLogs, saveLog], maxBytes)
      return {
        ...draft,
        chatVfsSnapshot: after,
        vfsPathVersionStore: merged.vfsPathVersionStore,
        vfsCheckpoints: merged.vfsCheckpoints,
        chatVfsLogs,
      }
    })
    return checkpointId
  }

  applyCheckpointById(checkpointId: string): { ok: true } | { ok: false; errorCode: string; message: string } {
    const chat = this.store.getState().chat
    const record = chat.vfsCheckpoints.find((row) => row.id === checkpointId)
    if (!record) {
      return { ok: false, errorCode: 'CHECKPOINT_NOT_FOUND', message: 'Checkpoint is unavailable (missing or evicted).' }
    }
    const chainOk = validateParentChainForCheckpoint(record.treeVersion, chat.vfsPathVersionStore)
    if (!chainOk.ok) {
      return { ok: false, errorCode: 'CHECKPOINT_INVALID', message: chainOk.message }
    }

    const working = new VfsCore(this.codec)
    working.importSnapshot(createEmptyVfsSnapshot())
    try {
      const orderedPaths = Object.keys(record.treeVersion).sort(
        (a, b) => pathDepth(a) - pathDepth(b) || a.localeCompare(b),
      )
      for (const path of orderedPaths) {
        const versionId = record.treeVersion[path]
        if (!versionId) continue
        const entry = chat.vfsPathVersionStore[path]?.find((e) => e.versionId === versionId) ?? null
        if (!entry) {
          return { ok: false, errorCode: 'CHECKPOINT_VERSION_MISSING', message: `Missing version ${versionId} for ${path}` }
        }
        if (entry.kind === 'directory') {
          working.mkdir(path, { recursive: true })
        } else {
          const decoded = this.codec.decode(entry.content!)
          working.writeFile(path, decoded, {
            createParents: true,
            updatedBy: entry.updatedBy ?? 'user',
          })
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false, errorCode: 'CHECKPOINT_MATERIALIZE_FAILED', message }
    }

    const nextSnapshot = working.exportSnapshot()
    this.store.updateChat((draft) => ({ ...draft, chatVfsSnapshot: nextSnapshot }))
    return { ok: true }
  }
}
