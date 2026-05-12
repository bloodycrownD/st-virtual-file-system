import type { VfsDirectoryNodeSnapshot, VfsNodeSnapshot, VfsSnapshot } from '@/domain/vfs/types'
import { normalizePath, ROOT_PATH } from '@/domain/vfs/path-utils'

/** Collect every normalized path present in a snapshot tree (root included). */
export function collectPathsFromSnapshot(snapshot: VfsSnapshot): string[] {
  const root = snapshot.nodes[snapshot.rootId]
  if (!root || root.type !== 'directory') return [ROOT_PATH]
  const out: string[] = []
  const walk = (node: VfsNodeSnapshot): void => {
    out.push(normalizePath(node.path))
    if (node.type === 'directory') {
      const dir = node as VfsDirectoryNodeSnapshot
      for (const childId of dir.children) {
        const child = snapshot.nodes[childId]
        if (child) walk(child)
      }
    }
  }
  walk(root)
  return out.sort((a, b) => a.localeCompare(b))
}

function pathDepth(path: string): number {
  if (path === ROOT_PATH) return 0
  return path.split('/').filter(Boolean).length
}

/** Deepest paths first — safe for recursive deletes before parents. */
export function sortPathsForAbsentApply(paths: string[]): string[] {
  return [...paths].sort((a, b) => pathDepth(b) - pathDepth(a) || b.localeCompare(a))
}

/** Shallow paths first — parents before children when restoring nodes. */
export function sortPathsForPresentApply(paths: string[]): string[] {
  return [...paths].sort((a, b) => pathDepth(a) - pathDepth(b) || a.localeCompare(b))
}
