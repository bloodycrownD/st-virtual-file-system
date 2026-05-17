import { basename } from '@/domain/vfs/path-utils'

/**
 * Whether UI read/preview surfaces should run the Markdown renderer.
 * PRD: extension `.md` only (case-insensitive). Not used by work-tree macro.
 */
export function isVfsMarkdownPreviewPath(path: string): boolean {
  if (!path?.trim()) return false
  const name = basename(path).toLowerCase()
  return name.endsWith('.md')
}
