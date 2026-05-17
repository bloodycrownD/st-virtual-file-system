import { describe, expect, it } from 'vitest'
import { VfsCore } from '@/domain/vfs/vfs-core'
import { DeflateContentCodec } from '@/infra/serialization/deflate-codec'
import { replaceTool } from '@/app/services/virtual-tools/tools'

function vfsWithFile(content: string): VfsCore {
  const vfs = new VfsCore(new DeflateContentCodec())
  vfs.writeFile('/a.txt', content, { createParents: true })
  return vfs
}

describe('replace virtual tool', () => {
  it('replaces a unique substring', () => {
    const vfs = vfsWithFile('alpha\nbeta\ngamma')
    const result = replaceTool.execute(
      { path: '/a.txt', oldContent: 'beta', newContent: 'BETA' },
      { vfs },
    )
    expect(result.ok).toBe(true)
    expect(vfs.readFile('/a.txt')).toBe('alpha\nBETA\ngamma')
  })

  it('rejects empty oldContent', () => {
    const vfs = vfsWithFile('hello')
    expect(() =>
      replaceTool.execute({ path: '/a.txt', oldContent: '', newContent: 'y' }, { vfs }),
    ).toThrow(/oldContent/)
  })

  it('rejects ambiguous match unless replaceAll', () => {
    const vfs = vfsWithFile('foo bar foo')
    expect(() =>
      replaceTool.execute({ path: '/a.txt', oldContent: 'foo', newContent: 'baz' }, { vfs }),
    ).toThrow(/not unique/)
    const result = replaceTool.execute(
      { path: '/a.txt', oldContent: 'foo', newContent: 'baz', replaceAll: true },
      { vfs },
    )
    expect(result.ok).toBe(true)
    expect(vfs.readFile('/a.txt')).toBe('baz bar baz')
  })

  it('rejects when oldContent is not found', () => {
    const vfs = vfsWithFile('hello')
    expect(() =>
      replaceTool.execute({ path: '/a.txt', oldContent: 'missing', newContent: 'x' }, { vfs }),
    ).toThrow(/not found/)
  })
})
