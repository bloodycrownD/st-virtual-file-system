import { VfsInvalidPathError } from './vfs-errors'

/**
 * VFS path utilities.
 *
 * Responsibilities:
 * - Normalize and compose VFS paths into a single canonical form so the rest of
 *   the VFS can rely on simple string equality and prefix checks.
 *
 * Canonical form (output of `normalizePath`):
 * - Always absolute (starts with `/`).
 * - Uses forward slashes only (Windows `\` is converted).
 * - Collapses `.` segments.
 * - Resolves `..` segments and **rejects** any path that would escape the root.
 * - Root is represented as exactly `/`.
 *
 * Why strict normalization matters:
 * - The VFS keeps indexes keyed by path string; if multiple spellings of the same
 *   path were allowed (e.g. `a/../b` vs `/b`), correctness bugs and snapshot
 *   ambiguity would follow.
 * - Root-escape protection (`..` beyond root) prevents directory traversal-style
 *   behavior in any consumers that treat VFS paths as untrusted input.
 */
export const ROOT_PATH = '/'

/**
 * Convert an arbitrary user-provided path into the VFS canonical form.
 *
 * @throws {VfsInvalidPathError}
 * - If the path is empty/whitespace.
 * - If normalization would escape the VFS root (e.g. `../../x`).
 */
export function normalizePath(inputPath: string): string {
  if (!inputPath || !inputPath.trim()) {
    throw new VfsInvalidPathError('Path cannot be empty')
  }

  const normalizedSlash = inputPath.trim().replace(/\\/g, '/')
  const withRoot = normalizedSlash.startsWith('/') ? normalizedSlash : `/${normalizedSlash}`
  const tokens = withRoot.split('/')
  const stack: string[] = []

  for (const token of tokens) {
    if (!token || token === '.') continue
    if (token === '..') {
      if (stack.length === 0) {
        throw new VfsInvalidPathError(`Path escapes root: ${inputPath}`)
      }
      stack.pop()
      continue
    }
    stack.push(token)
  }

  return stack.length === 0 ? ROOT_PATH : `/${stack.join('/')}`
}

/**
 * Return the canonical parent directory for a path.
 *
 * Notes:
 * - `dirname("/")` is defined as `/`.
 */
export function dirname(path: string): string {
  const normalized = normalizePath(path)
  if (normalized === ROOT_PATH) return ROOT_PATH
  const index = normalized.lastIndexOf('/')
  return index <= 0 ? ROOT_PATH : normalized.slice(0, index)
}

/**
 * Return the final path segment for a path.
 *
 * Notes:
 * - `basename("/")` is defined as an empty string.
 */
export function basename(path: string): string {
  const normalized = normalizePath(path)
  if (normalized === ROOT_PATH) return ''
  const index = normalized.lastIndexOf('/')
  return normalized.slice(index + 1)
}

/**
 * Join a parent path and a child segment into a normalized canonical path.
 *
 * Important:
 * - `child` is treated as a single segment input; any separators are preserved
 *   and then re-normalized by `normalizePath`.
 *
 * @throws {VfsInvalidPathError} If `child` is empty/whitespace.
 */
export function joinPath(parent: string, child: string): string {
  const normalizedParent = normalizePath(parent)
  const normalizedChild = child.replace(/\\/g, '/').trim()
  if (!normalizedChild) {
    throw new VfsInvalidPathError('Child segment cannot be empty')
  }
  const candidate = normalizedParent === ROOT_PATH ? `/${normalizedChild}` : `${normalizedParent}/${normalizedChild}`
  return normalizePath(candidate)
}
