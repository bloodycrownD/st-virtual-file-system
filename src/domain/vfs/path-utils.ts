import { VfsInvalidPathError } from './vfs-errors'

export const ROOT_PATH = '/'

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

export function dirname(path: string): string {
  const normalized = normalizePath(path)
  if (normalized === ROOT_PATH) return ROOT_PATH
  const index = normalized.lastIndexOf('/')
  return index <= 0 ? ROOT_PATH : normalized.slice(0, index)
}

export function basename(path: string): string {
  const normalized = normalizePath(path)
  if (normalized === ROOT_PATH) return ''
  const index = normalized.lastIndexOf('/')
  return normalized.slice(index + 1)
}

export function joinPath(parent: string, child: string): string {
  const normalizedParent = normalizePath(parent)
  const normalizedChild = child.replace(/\\/g, '/').trim()
  if (!normalizedChild) {
    throw new VfsInvalidPathError('Child segment cannot be empty')
  }
  const candidate = normalizedParent === ROOT_PATH ? `/${normalizedChild}` : `${normalizedParent}/${normalizedChild}`
  return normalizePath(candidate)
}
