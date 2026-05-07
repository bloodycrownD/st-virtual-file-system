import { describe, expect, it } from 'vitest'
import { VfsCore } from '@/domain/vfs/vfs-core'
import { DeflateContentCodec } from '@/infra/serialization/deflate-codec'
import { parseVfsSnapshot } from '@/infra/persistence/vfs-snapshot.schema'

describe('vfs serialization', () => {
  it('keeps metadata plain while compressing large text content', () => {
    const core = new VfsCore(new DeflateContentCodec({ threshold: 10 }))
    const bigText = 'abcdefghij'.repeat(20)

    core.writeFile('/big.txt', bigText)
    core.writeFile('/small.txt', 'tiny')
    const snapshot = core.exportSnapshot()

    const bigNode = Object.values(snapshot.nodes).find((node) => node.path === '/big.txt')
    const smallNode = Object.values(snapshot.nodes).find((node) => node.path === '/small.txt')

    expect(bigNode?.type).toBe('file')
    expect(smallNode?.type).toBe('file')
    if (bigNode?.type === 'file' && smallNode?.type === 'file') {
      expect(bigNode.content.encoding).toBe('deflate-base64')
      expect(smallNode.content.encoding).toBe('plain')
    }
  })

  it('round-trips by JSON stringify/parse + import', () => {
    const core = new VfsCore(new DeflateContentCodec({ threshold: 8 }))
    core.mkdir('/docs')
    core.writeFile('/docs/readme.md', '# hello')

    const raw = JSON.stringify(core.exportSnapshot())
    const parsed = parseVfsSnapshot(JSON.parse(raw))

    const restored = new VfsCore(new DeflateContentCodec({ threshold: 8 }))
    restored.importSnapshot(parsed)

    expect(restored.readFile('/docs/readme.md')).toBe('# hello')
    expect(restored.stat('/docs/readme.md').size).toBe(7)
  })

  it('avoids id collision after import and new writes', () => {
    const source = new VfsCore(new DeflateContentCodec({ threshold: 8 }))
    source.writeFile('/a.txt', 'a')
    const snapshot = source.exportSnapshot()

    const restored = new VfsCore(new DeflateContentCodec({ threshold: 8 }))
    restored.importSnapshot(snapshot)
    restored.writeFile('/b.txt', 'b')

    expect(restored.readFile('/a.txt')).toBe('a')
    expect(restored.readFile('/b.txt')).toBe('b')
  })
})
