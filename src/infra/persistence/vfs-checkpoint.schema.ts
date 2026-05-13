import type { VfsFileContentSnapshot } from '@/domain/vfs/types'

/** What produced this sparse materialization checkpoint. */
export type VfsCheckpointSource = 'tool-batch' | 'editor-save'

/** Directory vs file rows in the per-path version chain. */
export type VfsPathVersionKind = 'directory' | 'file'

/**
 * One immutable version row for a normalized absolute path.
 * WHY: checkpoints only store `versionId` pointers; bodies live here (append-only per path).
 */
export interface VfsPathVersionEntry {
  versionId: string
  kind: VfsPathVersionKind
  /** Present for `kind === 'file'`; omitted for directories. */
  content?: VfsFileContentSnapshot
  /** Preserved from the authoritative snapshot for macro attribution on rollback materialization. */
  updatedBy?: 'user' | 'assistant'
  /** ISO-8601 timestamp for auditing / UI. */
  createdAt: string
}

/**
 * Sparse post-commit checkpoint: `treeVersion` lists paths that **exist** at this instant.
 * WHY: paths omitted from `treeVersion` are treated as absent (full-tree materialization).
 */
export interface VfsCheckpointRecord {
  id: string
  time: string
  source: VfsCheckpointSource
  treeVersion: Record<string, string>
}

export type VfsPathVersionStore = Record<string, VfsPathVersionEntry[]>

function parsePathVersionEntry(raw: unknown): VfsPathVersionEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const versionId = typeof o.versionId === 'string' && o.versionId ? o.versionId : null
  const kind = o.kind === 'directory' || o.kind === 'file' ? o.kind : null
  const createdAt = typeof o.createdAt === 'string' && o.createdAt ? o.createdAt : null
  if (!versionId || !kind || !createdAt) return null
  if (kind === 'directory') {
    return { versionId, kind: 'directory', createdAt }
  }
  const content = o.content && typeof o.content === 'object' ? (o.content as VfsFileContentSnapshot) : null
  if (!content || (content.encoding !== 'plain' && content.encoding !== 'deflate-base64')) return null
  if (typeof content.data !== 'string' || typeof content.originalSize !== 'number') return null
  const updatedBy = o.updatedBy === 'user' || o.updatedBy === 'assistant' ? o.updatedBy : undefined
  return { versionId, kind: 'file', content, createdAt, ...(updatedBy ? { updatedBy } : {}) }
}

export function parseVfsPathVersionStore(raw: unknown): VfsPathVersionStore {
  if (!raw || typeof raw !== 'object') return {}
  const input = raw as Record<string, unknown>
  const out: VfsPathVersionStore = {}
  for (const [pathKey, chainRaw] of Object.entries(input)) {
    if (!pathKey || typeof pathKey !== 'string') continue
    if (!Array.isArray(chainRaw)) continue
    const chain = chainRaw.map((row) => parsePathVersionEntry(row)).filter((row): row is VfsPathVersionEntry => !!row)
    if (chain.length > 0) out[pathKey] = chain
  }
  return out
}

function parseCheckpointRecord(raw: unknown): VfsCheckpointRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const id = typeof o.id === 'string' && o.id ? o.id : null
  const time = typeof o.time === 'string' && o.time ? o.time : null
  const source = o.source === 'tool-batch' || o.source === 'editor-save' ? o.source : null
  if (!id || !time || !source) return null
  const tvRaw = o.treeVersion && typeof o.treeVersion === 'object' ? (o.treeVersion as Record<string, unknown>) : null
  if (!tvRaw) return null
  const treeVersion: Record<string, string> = {}
  for (const [p, v] of Object.entries(tvRaw)) {
    if (typeof p !== 'string' || !p) continue
    if (typeof v !== 'string' || !v) continue
    treeVersion[p] = v
  }
  return { id, time, source, treeVersion }
}

export function parseVfsCheckpoints(raw: unknown): VfsCheckpointRecord[] {
  if (!Array.isArray(raw)) return []
  return raw.map((row) => parseCheckpointRecord(row)).filter((row): row is VfsCheckpointRecord => !!row)
}

export function serializeVfsPathVersionStore(store: VfsPathVersionStore): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [path, chain] of Object.entries(store)) {
    out[path] = chain.map((e) =>
      e.kind === 'file'
        ? { versionId: e.versionId, kind: e.kind, content: e.content, createdAt: e.createdAt, ...(e.updatedBy ? { updatedBy: e.updatedBy } : {}) }
        : { versionId: e.versionId, kind: e.kind, createdAt: e.createdAt },
    )
  }
  return out
}

export function serializeVfsCheckpoints(rows: VfsCheckpointRecord[]): unknown[] {
  return rows.map((row) => ({
    id: row.id,
    time: row.time,
    source: row.source,
    treeVersion: { ...row.treeVersion },
  }))
}
