import type { VfsSnapshot, VfsNodeSnapshot, VfsFileContentSnapshot } from '@/domain/vfs/types'
import { VfsInvalidPathError } from '@/domain/vfs/vfs-errors'

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

  return {
    ...common,
    type,
    size: typeof raw.size === 'number' ? raw.size : 0,
    content: parseContent(raw.content),
  }
}

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

export function serializeVfsSnapshot(snapshot: VfsSnapshot): VfsSnapshot {
  // 输出“纯字面量”快照，保证可安全 JSON.stringify。
  return JSON.parse(JSON.stringify(snapshot)) as VfsSnapshot
}
