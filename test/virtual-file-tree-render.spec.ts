import { describe, expect, it } from 'vitest'
import type { VfsDirectoryNodeSnapshot, VfsFileNodeSnapshot, VfsSnapshot } from '@/domain/vfs/types'
import { renderVirtualFileTree } from '@/domain/work-tree/virtual-file-tree-render'

function createSnapshot(nodes: Array<VfsDirectoryNodeSnapshot | VfsFileNodeSnapshot>): VfsSnapshot {
  const map: Record<string, VfsDirectoryNodeSnapshot | VfsFileNodeSnapshot> = {}
  for (const n of nodes) {
    map[n.id] = n
  }
  return {
    schemaVersion: 1,
    rootId: 'root',
    nodes: map,
  }
}

function dir(
  id: string,
  path: string,
  name: string,
  parentId: string | null,
  children: string[],
): VfsDirectoryNodeSnapshot {
  return {
    id,
    type: 'directory',
    path,
    name,
    parentId,
    children,
    mtime: 1,
  }
}

function file(
  id: string,
  path: string,
  name: string,
  parentId: string,
): VfsFileNodeSnapshot {
  return {
    id,
    type: 'file',
    path,
    name,
    parentId,
    size: 0,
    mtime: 1,
    ctime: 1,
    updatedBy: 'assistant',
    content: {
      encoding: 'plain',
      data: '',
      originalSize: 0,
    },
  }
}

describe('renderVirtualFileTree', () => {
  it('renders a stable tree-style layout with names only', () => {
    const nodes: Array<VfsDirectoryNodeSnapshot | VfsFileNodeSnapshot> = [
      dir('root', '/', '', null, ['docs', 'src']),
      dir('docs', '/docs', 'docs', 'root', ['readme']),
      dir('src', '/src', 'src', 'root', ['index']),
      file('readme', '/docs/readme.md', 'readme.md', 'docs'),
      file('index', '/src/index.ts', 'index.ts', 'src'),
    ]
    const snapshot = createSnapshot(nodes)
    const tree = renderVirtualFileTree(snapshot)

    expect(tree.split('\n')).toEqual([
      '/',
      '├── docs/',
      '│   └── readme.md',
      '└── src/',
      '    └── index.ts',
    ])
  })
})

