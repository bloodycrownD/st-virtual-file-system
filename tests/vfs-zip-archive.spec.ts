import { describe, expect, it } from 'vitest'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { DeflateContentCodec } from '@/infra/serialization/deflate-codec'
import { VfsCore } from '@/domain/vfs/vfs-core'
import { VfsInvalidPathError } from '@/domain/vfs/vfs-errors'
import { createEmptyVfsSnapshot } from '@/infra/persistence/vfs-snapshot.schema'
import {
  exportSnapshotToZipBytes,
  importZipBytesToSnapshot,
  VfsZipExportEmptyError,
  VfsZipImportEmptyError,
} from '@/app/services/vfs-archive/vfs-zip-archive'
import { vfsPathToZipEntryName, zipEntryNameToVfsPath } from '@/app/services/vfs-archive/vfs-zip-path'

const codec = new DeflateContentCodec()

function snapshotWithFiles(files: Record<string, string>) {
  const core = new VfsCore(codec)
  core.importSnapshot(createEmptyVfsSnapshot())
  for (const [path, content] of Object.entries(files)) {
    core.writeFile(path, content, { createParents: true, updatedBy: 'user' })
  }
  return core.exportSnapshot()
}

describe('vfs-zip-path', () => {
  it('T-ZIP-01: maps VFS paths to ZIP entry names and rejects traversal', () => {
    expect(vfsPathToZipEntryName('/a/b.md')).toBe('a/b.md')
    expect(() => vfsPathToZipEntryName('../x')).toThrow(VfsInvalidPathError)
    expect(() => zipEntryNameToVfsPath('../evil.md')).toThrow(VfsInvalidPathError)
  })
})

describe('vfs-zip-archive export', () => {
  it('T-ZIP-02: exports all file nodes with matching ZIP contents', () => {
    const snapshot = snapshotWithFiles({
      '/notes/a.md': 'alpha',
      '/notes/b.md': 'beta',
    })
    const zipBytes = exportSnapshotToZipBytes(snapshot, codec)
    const unzipped = unzipSync(zipBytes)
    expect(Object.keys(unzipped).sort()).toEqual(['notes/a.md', 'notes/b.md'])
    expect(strFromU8(unzipped['notes/a.md'])).toBe('alpha')
    expect(strFromU8(unzipped['notes/b.md'])).toBe('beta')
  })

  it('T-ZIP-03: rejects export when snapshot has no files', () => {
    const empty = createEmptyVfsSnapshot()
    expect(() => exportSnapshotToZipBytes(empty, codec)).toThrow(VfsZipExportEmptyError)
  })
})

describe('vfs-zip-archive import', () => {
  it('T-ZIP-04: round-trips export → import with identical file contents', () => {
    const snapshot = snapshotWithFiles({ '/notes/a.md': 'hello zip' })
    const zipBytes = exportSnapshotToZipBytes(snapshot, codec)
    const imported = importZipBytesToSnapshot(zipBytes, codec)
    const core = new VfsCore(codec)
    core.importSnapshot(imported)
    expect(core.readFile('/notes/a.md')).toBe('hello zip')
  })

  it('T-ZIP-05: rejects ZIP entries with path traversal', () => {
    const evilZip = zipSync({ '../evil.md': strToU8('nope') })
    expect(() => importZipBytesToSnapshot(evilZip, codec)).toThrow()
  })

  it('T-ZIP-06: rejects corrupt random bytes', () => {
    const garbage = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(() => importZipBytesToSnapshot(garbage, codec)).toThrow()
  })

  it('T-ZIP-07: rejects empty ZIP archives', () => {
    const emptyZip = zipSync({})
    expect(() => importZipBytesToSnapshot(emptyZip, codec)).toThrow(VfsZipImportEmptyError)
  })

  it('T-ZIP-08: ignores __MACOSX metadata; metadata-only archives are empty', () => {
    const metaOnly = zipSync({ '__MACOSX/._notes': strToU8('meta') })
    expect(() => importZipBytesToSnapshot(metaOnly, codec)).toThrow(VfsZipImportEmptyError)
  })
})
