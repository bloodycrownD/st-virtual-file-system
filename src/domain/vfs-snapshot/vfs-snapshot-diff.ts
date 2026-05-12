import type { VfsDirectoryNodeSnapshot, VfsFileNodeSnapshot, VfsNodeSnapshot, VfsSnapshot } from '@/domain/vfs/types'
import { normalizePath, ROOT_PATH } from '@/domain/vfs/path-utils'
import { collectPathsFromSnapshot } from '@/domain/vfs-snapshot/vfs-snapshot-paths'

function getNodeAtPath(snapshot: VfsSnapshot, path: string): VfsNodeSnapshot | null {
  const p = normalizePath(path)
  for (const node of Object.values(snapshot.nodes)) {
    if (normalizePath(node.path) === p) return node
  }
  return null
}

/** Structural fingerprint for diffing a single path between two snapshots (mtime ignored). */
function fingerprintAtPath(snapshot: VfsSnapshot, path: string): string | null {
  const node = getNodeAtPath(snapshot, path)
  if (!node) return null
  if (node.type === 'file') {
    const f = node as VfsFileNodeSnapshot
    return JSON.stringify({
      t: 'file',
      path: normalizePath(f.path),
      size: f.size,
      enc: f.content.encoding,
      data: f.content.data,
      ob: f.updatedBy,
    })
  }
  const d = node as VfsDirectoryNodeSnapshot
  const childPaths = d.children
    .map((id) => snapshot.nodes[id]?.path)
    .filter(Boolean)
    .map((childPath) => normalizePath(String(childPath)))
    .sort((a, b) => a.localeCompare(b))
  return JSON.stringify({ t: 'dir', path: normalizePath(d.path), children: childPaths })
}

/**
 * Compute changed VFS paths between two authoritative snapshots.
 * WHY: tool-batch pre-manifest must list real paths (no `'*'` placeholder) per product spec.
 */
export function diffVfsSnapshotPaths(before: VfsSnapshot, after: VfsSnapshot): string[] {
  const paths = new Set<string>([...collectPathsFromSnapshot(before), ...collectPathsFromSnapshot(after)])
  const changed: string[] = []
  for (const path of paths) {
    if (path === ROOT_PATH) continue
    const left = fingerprintAtPath(before, path)
    const right = fingerprintAtPath(after, path)
    if (left !== right) changed.push(path)
  }
  return changed.sort((a, b) => a.localeCompare(b))
}
