import { describe, expect, it } from 'vitest'
import { VfsCore } from '@/domain/vfs/vfs-core'
import { DeflateContentCodec } from '@/infra/serialization/deflate-codec'
import { VfsInvalidPathError, VfsNotFoundError } from '@/domain/vfs/vfs-errors'

describe('vfs core', () => {
  it('supports directory and file lifecycle operations', () => {
    const core = new VfsCore(new DeflateContentCodec({ threshold: 16 }))

    core.mkdir('/docs')
    core.writeFile('/docs/a.txt', 'hello world')
    expect(core.readFile('/docs/a.txt')).toBe('hello world')

    core.rename('/docs/a.txt', 'b.txt')
    expect(core.exists('/docs/b.txt')).toBe(true)

    core.copy('/docs/b.txt', '/docs/c.txt')
    expect(core.readFile('/docs/c.txt')).toBe('hello world')

    core.move('/docs/c.txt', '/c.txt')
    expect(core.exists('/c.txt')).toBe(true)

    core.delete('/docs', { recursive: true })
    expect(core.exists('/docs')).toBe(false)
  })

  it('provides list/stat/walk and touch semantics', async () => {
    const core = new VfsCore(new DeflateContentCodec({ threshold: 64 }))
    core.mkdir('/a')
    core.writeFile('/a/file.txt', 'x')
    const before = core.stat('/a/file.txt').mtime

    await new Promise((resolve) => setTimeout(resolve, 2))
    core.touch('/a/file.txt')
    const after = core.stat('/a/file.txt').mtime

    expect(after).toBeGreaterThanOrEqual(before)
    expect(core.list('/a').map((item) => item.name)).toEqual(['file.txt'])
    expect(core.walk('/').some((item) => item.path === '/a/file.txt')).toBe(true)
  })

  it('rejects invalid paths and missing entries', () => {
    const core = new VfsCore(new DeflateContentCodec())

    expect(() => core.mkdir('/../x')).toThrowError()
    expect(() => core.readFile('/missing.txt')).toThrow(VfsNotFoundError)
  })

  it('rejects moving a directory into itself or descendants', () => {
    const core = new VfsCore(new DeflateContentCodec())
    core.mkdir('/a/b', { recursive: true })

    expect(() => core.move('/a', '/a')).toThrow(VfsInvalidPathError)
    expect(() => core.move('/a', '/a/b/c')).toThrow(VfsInvalidPathError)
  })

  it('rejects copying a directory into itself or descendants', () => {
    const core = new VfsCore(new DeflateContentCodec())
    core.mkdir('/a/b', { recursive: true })

    expect(() => core.copy('/a', '/a')).toThrow(VfsInvalidPathError)
    expect(() => core.copy('/a', '/a/b/c')).toThrow(VfsInvalidPathError)
  })
})
