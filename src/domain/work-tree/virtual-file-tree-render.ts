/**
 * @file `{{VIRTUAL_FILE_TREE}}` renderer: classic `tree`-style text, names only (path by hierarchy).
 *
 * Sorting: each directory's children sorted by `name` for stable, deterministic output.
 */
import type { VfsSnapshot, VfsDirectoryNodeSnapshot, VfsNodeSnapshot } from '@/domain/vfs/types'
import { ROOT_PATH } from '@/domain/vfs/path-utils'

const PREFIX_MID = '├── '
const PREFIX_END = '└── '
const PREFIX_PIPE = '│   '
const PREFIX_GAP = '    '

function sortedChildren(snapshot: VfsSnapshot, dir: VfsDirectoryNodeSnapshot): VfsNodeSnapshot[] {
  const list = dir.children.map((id) => snapshot.nodes[id]).filter(Boolean) as VfsNodeSnapshot[]
  return list.sort((a, b) => a.name.localeCompare(b.name))
}

function displayLabel(node: VfsNodeSnapshot): string {
  if (node.type === 'directory') {
    if (node.path === ROOT_PATH) return '/'
    return `${node.name}/`
  }
  return node.name
}

/**
 * Render a multiline `tree` diagram for the snapshot (no file contents).
 */
export function renderVirtualFileTree(snapshot: VfsSnapshot): string {
  const root = snapshot.nodes[snapshot.rootId]
  if (!root || root.type !== 'directory') return '/'
  const lines: string[] = []
  lines.push(displayLabel(root))

  const walk = (dir: VfsDirectoryNodeSnapshot, prefix: string): void => {
    const children = sortedChildren(snapshot, dir)
    children.forEach((child, index) => {
      const isLast = index === children.length - 1
      const connector = isLast ? PREFIX_END : PREFIX_MID
      lines.push(`${prefix}${connector}${displayLabel(child)}`)
      if (child.type === 'directory') {
        const ext = isLast ? PREFIX_GAP : PREFIX_PIPE
        walk(child, `${prefix}${ext}`)
      }
    })
  }

  walk(root, '')
  return lines.join('\n')
}
