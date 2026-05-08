import { describe, expect, it } from 'vitest'
import type { VfsDirectoryNodeSnapshot, VfsFileNodeSnapshot, VfsSnapshot } from '@/domain/vfs/types'
import type { WorkTreeConfig } from '@/domain/work-tree/work-tree.types'
import { DEFAULT_DIRECTORY_RULE } from '@/domain/work-tree/work-tree.types'
import { renderVirtualWorkTree } from '@/domain/work-tree/work-tree-engine'

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

function createDir(id: string, path: string, name: string, children: string[]): VfsDirectoryNodeSnapshot {
  return {
    id,
    type: 'directory',
    path,
    name,
    parentId: path === '/' ? null : 'root',
    children,
    mtime: 1,
  }
}

function createFile(id: string, path: string, name: string, content: string, mtime = 10): VfsFileNodeSnapshot {
  return {
    id,
    type: 'file',
    path,
    name,
    parentId: 'root',
    size: content.length,
    mtime,
    ctime: mtime,
    updatedBy: 'assistant',
    content: {
      encoding: 'plain',
      data: content,
      originalSize: content.length,
    },
  }
}

describe('renderVirtualWorkTree', () => {
  it('returns empty string when workTree is null', () => {
    const snapshot = createSnapshot([
      createDir('root', '/', '', []),
    ])
    expect(renderVirtualWorkTree(snapshot, null)).toBe('')
  })

  it('prefers selectedFiles over directory rules and deduplicates paths', () => {
    const root = createDir('root', '/', '', ['docs', 'f1'])
    const docs = createDir('docs', '/docs', 'docs', ['note'])
    const selected = createFile('f1', '/selected.md', 'selected.md', 'selected body')
    const note = createFile('note', '/docs/note.md', 'note.md', 'note body')
    const snapshot = createSnapshot([root, docs, selected, note])

    const workTree: WorkTreeConfig = {
      defaultRule: { ...DEFAULT_DIRECTORY_RULE, headCount: 1, fill: 'filename' },
      directoryOverrides: {},
      directoryRulesEnabled: {
        '/docs': true,
      },
      selectedFiles: ['/docs/note.md'],
    }

    const out = renderVirtualWorkTree(snapshot, workTree)
    const blocks = out.split('\n\n')
    expect(blocks.length).toBe(1)
    expect(blocks[0]).toContain('path="/docs/note.md"')
    expect(blocks[0]).toContain('1|note body')
  })

  it('applies head/tail window with union semantics and clamp', () => {
    const files: VfsFileNodeSnapshot[] = []
    const children: string[] = []
    for (let i = 0; i < 5; i += 1) {
      const id = `f${i}`
      const name = `f${i}.txt`
      children.push(id)
      files.push(createFile(id, `/${name}`, name, `content-${i}`, i + 1))
    }
    const root = createDir('root', '/', '', children)
    const snapshot = createSnapshot([root, ...files])

    const workTree: WorkTreeConfig = {
      defaultRule: {
        sortField: 'name',
        sortDirection: 'asc',
        headCount: 2,
        tailCount: 1001,
        fill: 'filename',
      },
      directoryOverrides: {},
      directoryRulesEnabled: {
        '/': true,
      },
      selectedFiles: [],
    }

    const out = renderVirtualWorkTree(snapshot, workTree)
    const blocks = out.split('\n\n')
    // With 5 files, head=2 and tail=clamped(1001)=1000 → union is 5 unique paths.
    expect(blocks.length).toBe(5)
  })

  it('omits non-markdown files under frontmatter fill strategy and shows front matter with placeholder for markdown', () => {
    const root = createDir('root', '/', '', ['md', 'txt'])
    const md = createFile(
      'md',
      '/doc.md',
      'doc.md',
      ['---', 'title: test', '---', '', '正文'].join('\n'),
    )
    const txt = createFile('txt', '/plain.txt', 'plain.txt', 'no front matter here')
    const snapshot = createSnapshot([root, md, txt])

    const workTree: WorkTreeConfig = {
      defaultRule: {
        sortField: 'name',
        sortDirection: 'asc',
        headCount: 0,
        tailCount: 0,
        fill: 'frontmatter',
      },
      directoryOverrides: {},
      directoryRulesEnabled: {
        '/': true,
      },
      selectedFiles: [],
    }

    const out = renderVirtualWorkTree(snapshot, workTree)
    const blocks = out.split('\n\n').filter(Boolean)
    expect(blocks.length).toBe(1)
    expect(blocks[0]).toContain('path="/doc.md"')
    expect(blocks[0]).toContain('正文省略....')
    expect(out).not.toContain('plain.txt')
  })

  it('skips directory rules when directory is not marked as enabled', () => {
    const root = createDir('root', '/', '', ['docs'])
    const docs = createDir('docs', '/docs', 'docs', ['note'])
    const note = createFile('note', '/docs/note.md', 'note.md', 'note body')
    const snapshot = createSnapshot([root, docs, note])

    const workTree: WorkTreeConfig = {
      defaultRule: { ...DEFAULT_DIRECTORY_RULE, headCount: 1, fill: 'filename' },
      directoryOverrides: {},
      directoryRulesEnabled: {
        '/docs': false,
      },
      selectedFiles: [],
    }

    const out = renderVirtualWorkTree(snapshot, workTree)
    expect(out).toBe('')
  })
})

