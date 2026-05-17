import { normalizePath, ROOT_PATH } from '@/domain/vfs/path-utils'
import { VfsInvalidPathError } from '@/domain/vfs/vfs-errors'

/** Thrown when a ZIP entry name fails path-safety checks before VFS normalization. */
export class VfsZipUnsafeEntryError extends VfsInvalidPathError {}

/**
 * Map a canonical VFS file path to a ZIP archive entry name (no leading `/`).
 *
 * @throws {VfsInvalidPathError} When `path` is not a file path (e.g. root `/`).
 */
export function vfsPathToZipEntryName(path: string): string {
  const normalized = normalizePath(path)
  if (normalized === ROOT_PATH) {
    throw new VfsInvalidPathError('Cannot export root as a file entry')
  }
  return normalized.slice(1)
}

/**
 * Map a ZIP entry name to a canonical VFS absolute path.
 *
 * @throws {VfsZipUnsafeEntryError | VfsInvalidPathError} On empty, absolute, traversal, or invalid segments.
 */
export function zipEntryNameToVfsPath(name: string): string {
  assertSafeZipEntryName(name)
  const slashNormalized = name.replace(/\\/g, '/')
  return normalizePath(`/${slashNormalized}`)
}

/**
 * Whether a ZIP entry should be skipped during import (OS metadata, directory placeholders).
 */
export function isIgnoredZipEntry(name: string): boolean {
  const normalized = name.replace(/\\/g, '/')
  if (!normalized || normalized.endsWith('/')) return true
  if (normalized.startsWith('__MACOSX/') || normalized.includes('/__MACOSX/')) return true
  const base = normalized.split('/').at(-1) ?? normalized
  if (base === '.DS_Store' || base === 'Thumbs.db') return true
  return false
}

/**
 * Reject ZIP entry names that cannot map safely to VFS paths (boundary before `normalizePath`).
 *
 * @throws {VfsZipUnsafeEntryError}
 */
export function assertSafeZipEntryName(name: string): void {
  if (!name || !name.trim()) {
    throw new VfsZipUnsafeEntryError('ZIP entry name cannot be empty')
  }
  if (name.includes('\0')) {
    throw new VfsZipUnsafeEntryError('ZIP entry name cannot contain null bytes')
  }
  const slashNormalized = name.replace(/\\/g, '/')
  if (slashNormalized.startsWith('/')) {
    throw new VfsZipUnsafeEntryError('ZIP entry name cannot be absolute')
  }
  if (slashNormalized.includes('\\')) {
    throw new VfsZipUnsafeEntryError('ZIP entry name cannot contain backslashes')
  }
  const segments = slashNormalized.split('/')
  if (segments.some((segment) => !segment.trim())) {
    throw new VfsZipUnsafeEntryError('ZIP entry name cannot contain empty path segments')
  }
}
