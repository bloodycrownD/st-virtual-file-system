import { describe, expect, it } from 'vitest'
import type { VfsDirectoryNodeSnapshot, VfsFileNodeSnapshot, VfsSnapshot } from '@/domain/vfs/types'
import type { WorkTreeConfig } from '@/domain/work-tree/work-tree.types'
import {
  createDefaultWorkTreeConfig,
  parseWorkTreeConfig,
  serializeWorkTreeConfig,
} from '@/domain/work-tree/work-tree.types'
import {
  isFileIncludedInWorkTree,
  renderVirtualWorkTree,
  resolveWorkTreeFileRowState,
} from '@/domain/work-tree/work-tree-engine'

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

function createFile(
  id: string,
  path: string,
  name: string,
  content: string,
  mtime = 10,
  parentId = 'root',
): VfsFileNodeSnapshot {
  return {
    id,
    type: 'file',
    path,
    name,
    parentId,
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

function baseWorkTree(partial: Partial<WorkTreeConfig> = {}): WorkTreeConfig {
  const d = createDefaultWorkTreeConfig()
  return {
    ...d,
    ...partial,
    schemaVersion: 2,
    fileInclusionByPath: { ...d.fileInclusionByPath, ...partial.fileInclusionByPath },
    directoryRuleByPath: { ...d.directoryRuleByPath, ...partial.directoryRuleByPath },
    directoryRuleEnabledByPath: { ...d.directoryRuleEnabledByPath, ...partial.directoryRuleEnabledByPath },
  }
}

describe('parseWorkTreeConfig + serializeWorkTreeConfig', () => {
  it('returns null for legacy shapes', () => {
    expect(
      parseWorkTreeConfig({
        defaultRule: { sortField: 'name', sortDirection: 'asc', headCount: 1, tailCount: 0, fill: 'omit' },
        directoryOverrides: {},
        directoryRulesEnabled: {},
        selectedFiles: [],
      }),
    ).toBeNull()
    expect(parseWorkTreeConfig({ schemaVersion: 2, selectedFiles: [] })).toBeNull()
  })

  it('round-trips v2', () => {
    const cfg = baseWorkTree({
      fileInclusionByPath: { '/a.txt': 'explicit-include' },
      directoryRuleByPath: {
        '/': { sortField: 'name', sortDirection: 'asc', headCount: 3, tailCount: 0, fill: 'omit' },
      },
      directoryRuleEnabledByPath: { '/docs': true },
    })
    const raw = serializeWorkTreeConfig(cfg)
    const again = parseWorkTreeConfig(raw)
    expect(again).not.toBeNull()
    expect(again?.schemaVersion).toBe(2)
    expect(again?.fileInclusionByPath['/a.txt']).toBe('explicit-include')
  })

  it('ensure default root head is 1000', () => {
    const d = createDefaultWorkTreeConfig()
    expect(d.directoryRuleByPath['/']?.headCount).toBe(1000)
  })
})

describe('resolveWorkTreeFileRowState / renderVirtualWorkTree', () => {
  it('treats null workTree like createDefaultWorkTreeConfig() so macro matches UI defaults', () => {
    const empty = createSnapshot([createDir('root', '/', '', [])])
    expect(renderVirtualWorkTree(empty, null)).toBe(renderVirtualWorkTree(empty, createDefaultWorkTreeConfig()))

    const root = createDir('root', '/', '', ['f'])
    const f = createFile('f', '/a.txt', 'a.txt', 'hello', 10, 'root')
    const withFile = createSnapshot([root, f])
    expect(renderVirtualWorkTree(withFile, null)).toBe(renderVirtualWorkTree(withFile, createDefaultWorkTreeConfig()))
    expect(renderVirtualWorkTree(withFile, null)).toContain('path="/a.txt"')
  })

  it('explicit-include stays full when parent directory rule is disabled', () => {
    const root = createDir('root', '/', '', ['docs'])
    const docs = createDir('docs', '/docs', 'docs', ['note'])
    const note = createFile('note', '/docs/note.md', 'note.md', 'note body', 10, 'docs')
    const snapshot = createSnapshot([root, docs, note])

    const workTree = baseWorkTree({
      fileInclusionByPath: { '/docs/note.md': 'explicit-include' },
      directoryRuleByPath: {
        '/docs': { sortField: 'name', sortDirection: 'asc', headCount: 0, tailCount: 0, fill: 'omit' },
      },
      directoryRuleEnabledByPath: {},
    })

    expect(resolveWorkTreeFileRowState(snapshot, workTree, '/docs/note.md').included).toBe(true)
    const out = renderVirtualWorkTree(snapshot, workTree)
    expect(out).toContain('path="/docs/note.md"')
    expect(out).toContain('1|note body')
  })

  it('follow-parent under non-root is excluded when directory rule is off', () => {
    const root = createDir('root', '/', '', ['docs'])
    const docs = createDir('docs', '/docs', 'docs', ['note'])
    const note = createFile('note', '/docs/note.md', 'note.md', 'note body', 10, 'docs')
    const snapshot = createSnapshot([root, docs, note])

    const workTree = baseWorkTree({
      directoryRuleByPath: {
        '/docs': { sortField: 'name', sortDirection: 'asc', headCount: 10, tailCount: 0, fill: 'filename' },
      },
      directoryRuleEnabledByPath: {},
    })

    expect(resolveWorkTreeFileRowState(snapshot, workTree, '/docs/note.md').included).toBe(false)
    expect(renderVirtualWorkTree(snapshot, workTree)).toBe('')
  })

  it('root head=3 + fill omit includes only first three follow-parent children (sorted by name)', () => {
    const files = ['a.md', 'b.md', 'c.md', 'd.md'].map((name, i) =>
      createFile(`f${i}`, `/${name}`, name, `body-${name}`, i + 1),
    )
    const root = createDir('root', '/', '', files.map((f) => f.id))
    const snapshot = createSnapshot([root, ...files])

    const workTree = baseWorkTree({
      directoryRuleByPath: {
        '/': { sortField: 'name', sortDirection: 'asc', headCount: 3, tailCount: 0, fill: 'omit' },
      },
    })

    expect(resolveWorkTreeFileRowState(snapshot, workTree, '/a.md').included).toBe(true)
    expect(resolveWorkTreeFileRowState(snapshot, workTree, '/d.md').included).toBe(false)
    const out = renderVirtualWorkTree(snapshot, workTree)
    expect(out).toContain('path="/a.md"')
    expect(out).toContain('path="/c.md"')
    expect(out).not.toContain('path="/d.md"')
  })

  it('explicit-exclude wins over head batch', () => {
    const files = ['a.md', 'b.md', 'c.md'].map((name, i) =>
      createFile(`f${i}`, `/${name}`, name, `body-${name}`, i + 1),
    )
    const root = createDir('root', '/', '', files.map((f) => f.id))
    const snapshot = createSnapshot([root, ...files])

    const workTree = baseWorkTree({
      fileInclusionByPath: { '/b.md': 'explicit-exclude' },
      directoryRuleByPath: {
        '/': { sortField: 'name', sortDirection: 'asc', headCount: 3, tailCount: 0, fill: 'omit' },
      },
    })

    expect(resolveWorkTreeFileRowState(snapshot, workTree, '/b.md').included).toBe(false)
    const out = renderVirtualWorkTree(snapshot, workTree)
    expect(out).not.toContain('path="/b.md"')
  })

  it('explicit-include outside head batch is still included', () => {
    const files = ['a.md', 'b.md', 'c.md', 'd.md'].map((name, i) =>
      createFile(`f${i}`, `/${name}`, name, `body-${name}`, i + 1),
    )
    const root = createDir('root', '/', '', files.map((f) => f.id))
    const snapshot = createSnapshot([root, ...files])

    const workTree = baseWorkTree({
      fileInclusionByPath: { '/d.md': 'explicit-include' },
      directoryRuleByPath: {
        '/': { sortField: 'name', sortDirection: 'asc', headCount: 3, tailCount: 0, fill: 'omit' },
      },
    })

    expect(resolveWorkTreeFileRowState(snapshot, workTree, '/d.md').included).toBe(true)
    const out = renderVirtualWorkTree(snapshot, workTree)
    expect(out).toContain('path="/d.md"')
    expect(out).toContain('1|body-d.md')
  })

  it('explicit files do not consume head slots for follow-parent peers', () => {
    const a = createFile('fa', '/a.md', 'a.md', 'A', 1)
    const b = createFile('fb', '/b.md', 'b.md', 'B', 2)
    const c = createFile('fc', '/c.md', 'c.md', 'C', 3)
    const root = createDir('root', '/', '', ['fa', 'fb', 'fc'])
    const snapshot = createSnapshot([root, a, b, c])

    const workTree = baseWorkTree({
      fileInclusionByPath: { '/a.md': 'explicit-include' },
      directoryRuleByPath: {
        '/': { sortField: 'name', sortDirection: 'asc', headCount: 1, tailCount: 0, fill: 'omit' },
      },
    })

    expect(resolveWorkTreeFileRowState(snapshot, workTree, '/b.md').included).toBe(true)
    expect(resolveWorkTreeFileRowState(snapshot, workTree, '/c.md').included).toBe(false)
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

    const workTree = baseWorkTree({
      directoryRuleByPath: {
        '/': {
          sortField: 'name',
          sortDirection: 'asc',
          headCount: 2,
          tailCount: 1001,
          fill: 'filename',
        },
      },
    })

    const out = renderVirtualWorkTree(snapshot, workTree)
    const blocks = out.split('\n\n').filter(Boolean)
    expect(blocks.length).toBe(5)
  })

  it('markdown frontmatter parse failure still emits block with downgrade text', () => {
    const root = createDir('root', '/', '', ['md'])
    const md = createFile('md', '/doc.md', 'doc.md', 'not valid fm at all')
    const snapshot = createSnapshot([root, md])

    const workTree = baseWorkTree({
      directoryRuleByPath: {
        '/': { sortField: 'name', sortDirection: 'asc', headCount: 0, tailCount: 0, fill: 'frontmatter' },
      },
    })

    expect(isFileIncludedInWorkTree(snapshot, workTree, '/doc.md')).toBe(true)
    const out = renderVirtualWorkTree(snapshot, workTree)
    expect(out).toContain('path="/doc.md"')
    expect(out).toContain('FrontMatter解析失败')
    expect(out).toContain('文件名doc.md')
  })

  it('filename render mode never appends FrontMatter failure text', () => {
    const root = createDir('root', '/', '', ['md'])
    const md = createFile('md', '/doc.md', 'doc.md', 'not valid fm')
    const snapshot = createSnapshot([root, md])

    const workTree = baseWorkTree({
      directoryRuleByPath: {
        '/': { sortField: 'name', sortDirection: 'asc', headCount: 0, tailCount: 0, fill: 'filename' },
      },
    })

    const out = renderVirtualWorkTree(snapshot, workTree)
    expect(out).toContain('path="/doc.md"')
    expect(out).toContain('1|doc.md')
    expect(out).not.toContain('FrontMatter解析失败')
  })

  it('orders emitted files by active directory rule sort field and direction', () => {
    const root = createDir('root', '/', '', ['a', 'b'])
    const first = createFile('a', '/a.md', 'a.md', 'A', 1)
    const second = createFile('b', '/b.md', 'b.md', 'B', 9)
    const snapshot = createSnapshot([root, first, second])

    const workTree = baseWorkTree({
      directoryRuleByPath: {
        '/': {
          sortField: 'mtime',
          sortDirection: 'desc',
          headCount: 2,
          tailCount: 0,
          fill: 'omit',
        },
      },
    })

    const out = renderVirtualWorkTree(snapshot, workTree)
    expect(out.indexOf('path="/b.md"')).toBeLessThan(out.indexOf('path="/a.md"'))
  })
})
