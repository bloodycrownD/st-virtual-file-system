import type { VfsSnapshot, VfsNodeSnapshot, VfsFileContentSnapshot, VfsDirectoryNodeSnapshot } from '@/domain/vfs/types'
import { VfsInvalidPathError } from '@/domain/vfs/vfs-errors'

/**
 * @file Snapshot schema normalization helpers.
 *
 * Snapshots are stored/transferred as JSON-friendly structures. This module provides:
 *
 * - `parseVfsSnapshot(raw)`: validates/coerces unknown input into a safe, well-typed `VfsSnapshot`.
 * - `serializeVfsSnapshot(snapshot)`: emits a plain JSON literal object suitable for
 *   `JSON.stringify` and storage.
 *
 * The parser is intentionally defensive: when a value is missing or of the wrong type, it falls
 * back to safe defaults or throws for structurally invalid nodes.
 */

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** 解析文件内容快照：约束为 JSON 友好结构（plain 或 deflate-base64）。 */
function parseContent(raw: unknown): VfsFileContentSnapshot {
  if (!isObject(raw)) throw new VfsInvalidPathError('Invalid snapshot content')
  const encoding = raw.encoding === 'deflate-base64' ? 'deflate-base64' : 'plain'
  const data = typeof raw.data === 'string' ? raw.data : ''
  const originalSize = typeof raw.originalSize === 'number' ? raw.originalSize : data.length
  const compressedSize = typeof raw.compressedSize === 'number' ? raw.compressedSize : undefined
  return { encoding, data, originalSize, compressedSize }
}

/** 解析单个节点快照（目录/文件分支处理）。 */
function parseNode(raw: unknown): VfsNodeSnapshot {
  if (!isObject(raw)) throw new VfsInvalidPathError('Invalid snapshot node')
  const type = raw.type === 'file' ? 'file' : raw.type === 'directory' ? 'directory' : null
  if (!type) throw new VfsInvalidPathError('Invalid snapshot node type')
  const common = {
    id: String(raw.id ?? ''),
    path: String(raw.path ?? ''),
    name: String(raw.name ?? ''),
    parentId: raw.parentId === null ? null : String(raw.parentId ?? ''),
    type,
    mtime: typeof raw.mtime === 'number' ? raw.mtime : Date.now(),
  } as const

  if (type === 'directory') {
    const children = Array.isArray(raw.children) ? raw.children.map((item) => String(item)) : []
    return { ...common, type, children }
  }

  const mtime = common.mtime
  const ctimeRaw = raw.ctime
  const ctime = typeof ctimeRaw === 'number' ? ctimeRaw : mtime
  const ub = raw.updatedBy === 'user' || raw.updatedBy === 'assistant' ? raw.updatedBy : 'assistant'

  return {
    ...common,
    type,
    size: typeof raw.size === 'number' ? raw.size : 0,
    content: parseContent(raw.content),
    ctime,
    updatedBy: ub,
  }
}

/** Minimal valid empty tree (root only). Used when chat has no persisted snapshot yet. */
export function createEmptyVfsSnapshot(): VfsSnapshot {
  const now = Date.now()
  const root: VfsDirectoryNodeSnapshot = {
    id: 'root',
    type: 'directory',
    path: '/',
    name: '',
    parentId: null,
    children: [],
    mtime: now,
  }
  return {
    schemaVersion: 1,
    rootId: 'root',
    nodes: { root },
  }
}

/**
 * Parse unknown input into a normalized `VfsSnapshot`.
 *
 * @throws `VfsInvalidPathError` when the overall structure is not object-like or nodes are invalid.
 */
export function parseVfsSnapshot(raw: unknown): VfsSnapshot {
  if (!isObject(raw)) throw new VfsInvalidPathError('Invalid snapshot')
  const nodesRaw = isObject(raw.nodes) ? raw.nodes : {}
  const nodes: Record<string, VfsNodeSnapshot> = {}
  for (const [id, node] of Object.entries(nodesRaw)) {
    nodes[id] = parseNode(node)
  }
  return {
    // 当前迭代固定版本 1，后续结构升级可在这里做向后兼容分流。
    schemaVersion: 1,
    rootId: String(raw.rootId ?? 'root'),
    nodes,
  }
}

/**
 * Serialize a snapshot to a plain JSON literal object.
 *
 * This performs a JSON round-trip to strip prototypes/references and ensure the result is safe to
 * persist.
 */
export function serializeVfsSnapshot(snapshot: VfsSnapshot): VfsSnapshot {
  // 输出“纯字面量”快照，保证可安全 JSON.stringify。
  return JSON.parse(JSON.stringify(snapshot)) as VfsSnapshot
}
