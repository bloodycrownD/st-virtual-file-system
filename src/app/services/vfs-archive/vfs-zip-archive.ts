import { strToU8, unzipSync, zipSync, type Zippable } from 'fflate'
import { VfsCore } from '@/domain/vfs/vfs-core'
import type { VfsSnapshot } from '@/domain/vfs/types'
import { normalizePath, ROOT_PATH } from '@/domain/vfs/path-utils'
import { VfsError } from '@/domain/vfs/vfs-errors'
import type { ContentCodec } from '@/infra/serialization/content-codec'
import { createEmptyVfsSnapshot } from '@/infra/persistence/vfs-snapshot.schema'
import type { WorkTreeConfig } from '@/domain/work-tree/work-tree.types'
import { ensureWorkTreeConfig } from '@/domain/work-tree/work-tree.types'
import {
  assertSafeZipEntryName,
  isIgnoredZipEntry,
  vfsPathToZipEntryName,
  zipEntryNameToVfsPath,
} from './vfs-zip-path'

/** Thrown when the snapshot has no file nodes to export. */
export class VfsZipExportEmptyError extends VfsError {}

/** Thrown when a ZIP has no importable file entries after filtering metadata. */
export class VfsZipImportEmptyError extends VfsError {}

/** Thrown when a ZIP entry is not valid UTF-8 text. */
export class VfsZipImportInvalidTextError extends VfsError {}

/** UTF-8 bytes in a realm-local Uint8Array so fflate `zipSync` recognizes file payloads. */
function utf8BytesForZip(text: string): Uint8Array {
  return new Uint8Array(strToU8(text))
}

function snapshotHasNodeAtPath(snapshot: VfsSnapshot, path: string): boolean {
  const normalized = normalizePath(path)
  return Object.values(snapshot.nodes).some((node) => node.path === normalized)
}

/**
 * Decode ZIP entry bytes as UTF-8 text; reject invalid byte sequences (import boundary).
 *
 * @throws {VfsZipImportInvalidTextError}
 */
function decodeZipEntryAsUtf8Text(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new VfsZipImportInvalidTextError('ZIP entry is not valid UTF-8 text')
  }
}

/**
 * Export all file nodes in a snapshot to a ZIP byte array (plain UTF-8 entries).
 *
 * @throws {VfsZipExportEmptyError} When there are no file nodes.
 */
export function exportSnapshotToZipBytes(snapshot: VfsSnapshot, codec: ContentCodec): Uint8Array {
  const fileNodes = Object.values(snapshot.nodes).filter((node) => node.type === 'file')
  if (fileNodes.length === 0) {
    throw new VfsZipExportEmptyError('No files to export')
  }

  const files: Zippable = {}
  for (const node of fileNodes) {
    const name = vfsPathToZipEntryName(node.path)
    const text = codec.decode(node.content)
    files[name] = utf8BytesForZip(text)
  }
  return zipSync(files, { level: 6 })
}

/**
 * Build a full VFS snapshot from ZIP bytes without touching persistence (transactional import).
 *
 * @throws {VfsZipImportEmptyError | VfsZipImportInvalidTextError | VfsError} On empty, corrupt, or unsafe archives.
 */
export function importZipBytesToSnapshot(bytes: Uint8Array, codec: ContentCodec): VfsSnapshot {
  let unzipped: Record<string, Uint8Array>
  try {
    unzipped = unzipSync(bytes) as Record<string, Uint8Array>
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid ZIP archive'
    throw new VfsError(`Failed to read ZIP: ${message}`)
  }

  const entries = Object.entries(unzipped).filter(([name]) => !isIgnoredZipEntry(name))
  if (entries.length === 0) {
    throw new VfsZipImportEmptyError('ZIP contains no importable files')
  }

  // Pre-flight: path safety + UTF-8 text before mutating an in-memory core (transactional import).
  const decoded: Array<{ zipName: string; vfsPath: string; text: string }> = []
  for (const [zipName, data] of entries) {
    assertSafeZipEntryName(zipName)
    const vfsPath = zipEntryNameToVfsPath(zipName)
    if (vfsPath === ROOT_PATH) {
      throw new VfsZipImportInvalidTextError('ZIP entry cannot map to root')
    }
    const text = decodeZipEntryAsUtf8Text(data)
    decoded.push({ zipName, vfsPath, text })
  }

  const core = new VfsCore(codec)
  core.importSnapshot(createEmptyVfsSnapshot())
  for (const { vfsPath, text } of decoded) {
    core.writeFile(vfsPath, text, { createParents: true, updatedBy: 'user' })
  }
  return core.exportSnapshot()
}

/**
 * Drop work-tree path keys that no longer exist in `snapshot` after a full VFS replace.
 */
export function pruneWorkTreeForSnapshot(workTree: WorkTreeConfig, snapshot: VfsSnapshot): WorkTreeConfig {
  const config = ensureWorkTreeConfig(workTree)
  const exists = (path: string) => snapshotHasNodeAtPath(snapshot, path)

  const fileInclusionByPath: WorkTreeConfig['fileInclusionByPath'] = {}
  for (const [path, mode] of Object.entries(config.fileInclusionByPath)) {
    if (exists(path)) fileInclusionByPath[path] = mode
  }

  const directoryRuleEnabledByPath: WorkTreeConfig['directoryRuleEnabledByPath'] = {}
  for (const [path, enabled] of Object.entries(config.directoryRuleEnabledByPath)) {
    if (exists(path)) directoryRuleEnabledByPath[path] = enabled
  }

  const directoryRuleByPath: WorkTreeConfig['directoryRuleByPath'] = {}
  for (const [path, rule] of Object.entries(config.directoryRuleByPath)) {
    if (path === ROOT_PATH || exists(path)) directoryRuleByPath[path] = rule
  }

  return ensureWorkTreeConfig({
    ...config,
    fileInclusionByPath,
    directoryRuleEnabledByPath,
    directoryRuleByPath,
  })
}
