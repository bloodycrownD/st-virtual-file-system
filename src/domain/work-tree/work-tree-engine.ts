/**
 * @file Pure work-tree rendering for `{{VIRTUAL_WORK_TREE}}`.
 *
 * Inputs: a persisted `VfsSnapshot` plus chat `WorkTreeConfig`. No I/O; decoding uses the same
 * deflate/plain codec as runtime VFS so macro output matches tool-written files.
 */
import type { VfsSnapshot, VfsDirectoryNodeSnapshot, VfsFileNodeSnapshot, VfsNodeSnapshot } from '@/domain/vfs/types'
import { normalizePath, basename as vfsBasename } from '@/domain/vfs/path-utils'
import { DeflateContentCodec } from '@/infra/serialization/deflate-codec'
import type { DirectoryRule, WorkTreeConfig } from '@/domain/work-tree/work-tree.types'

const codec = new DeflateContentCodec()

export function formatMacroTimestamp(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function escapeXmlAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

function getNodeByPath(snapshot: VfsSnapshot, path: string): VfsNodeSnapshot | undefined {
  const target = normalizePath(path)
  for (const node of Object.values(snapshot.nodes)) {
    if (node.path === target) return node
  }
  return undefined
}

function mustGetDirectory(snapshot: VfsSnapshot, path: string): VfsDirectoryNodeSnapshot {
  const n = getNodeByPath(snapshot, path)
  if (!n || n.type !== 'directory') throw new Error(`Not a directory: ${path}`)
  return n
}

function directChildFiles(snapshot: VfsSnapshot, dirPath: string): VfsFileNodeSnapshot[] {
  const dir = mustGetDirectory(snapshot, dirPath)
  const out: VfsFileNodeSnapshot[] = []
  for (const id of dir.children) {
    const node = snapshot.nodes[id]
    if (node?.type === 'file') out.push(node)
  }
  return out
}

function sortFieldValue(f: VfsFileNodeSnapshot, field: DirectoryRule['sortField']): string | number {
  if (field === 'name') return f.name.toLowerCase()
  if (field === 'ctime') return f.ctime
  return f.mtime
}

function sortFiles(files: VfsFileNodeSnapshot[], rule: DirectoryRule): VfsFileNodeSnapshot[] {
  const dir = rule.sortDirection === 'desc' ? -1 : 1
  return [...files].sort((a, b) => {
    const va = sortFieldValue(a, rule.sortField)
    const vb = sortFieldValue(b, rule.sortField)
    let c = 0
    if (typeof va === 'number' && typeof vb === 'number') c = va === vb ? 0 : va < vb ? -1 : 1
    else c = String(va).localeCompare(String(vb))
    return c * dir
  })
}

/** Head ∪ tail on sorted list; counts clamped 0..1000 in rule at call site. */
function pickHeadTailPaths(sorted: VfsFileNodeSnapshot[], head: number, tail: number): Set<string> {
  const h = Math.min(1000, Math.max(0, head))
  const t = Math.min(1000, Math.max(0, tail))
  const u = new Set<string>()
  for (const f of sorted.slice(0, h)) u.add(f.path)
  if (t > 0) {
    for (const f of sorted.slice(Math.max(0, sorted.length - t))) u.add(f.path)
  }
  return u
}

function isMarkdownFile(path: string): boolean {
  const name = vfsBasename(path).toLowerCase()
  return name.endsWith('.md') || name.endsWith('.markdown')
}

/**
 * Front matter lines plus trailing placeholder line, or null if not valid YAML-style FM.
 */
function frontMatterDisplayLines(content: string): string[] | null {
  const lines = content.split('\n')
  if (lines[0]?.trim() !== '---') return null
  let end = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === '---') {
      end = i
      break
    }
  }
  if (end < 0) return null
  const slice = lines.slice(0, end + 1)
  slice.push('正文省略....')
  return slice
}

type RenderMode = 'full' | 'filename' | 'frontmatter'

function buildRenderModes(snapshot: VfsSnapshot, config: WorkTreeConfig): Map<string, RenderMode> {
  const modes = new Map<string, RenderMode>()

  for (const raw of config.selectedFiles) {
    try {
      const p = normalizePath(raw)
      if (getNodeByPath(snapshot, p)?.type === 'file') modes.set(p, 'full')
    } catch {
      /* skip invalid path */
    }
  }

  for (const [dirRaw, enabled] of Object.entries(config.directoryRulesEnabled)) {
    if (!enabled) continue
    let dirNorm: string
    try {
      dirNorm = normalizePath(dirRaw)
    } catch {
      continue
    }
    if (getNodeByPath(snapshot, dirNorm)?.type !== 'directory') continue

    const rule = config.directoryOverrides[dirNorm] ?? config.defaultRule
    const files = directChildFiles(snapshot, dirNorm)
    if (files.length === 0) continue

    const sorted = sortFiles(files, rule)
    const priorityPaths = pickHeadTailPaths(sorted, rule.headCount, rule.tailCount)

    for (const f of sorted) {
      if (!priorityPaths.has(f.path)) continue
      if (!modes.has(f.path)) modes.set(f.path, 'full')
    }

    for (const f of sorted) {
      if (priorityPaths.has(f.path)) continue
      if (modes.has(f.path)) continue
      if (rule.fill === 'omit') continue
      if (rule.fill === 'filename') {
        modes.set(f.path, 'filename')
        continue
      }
      if (rule.fill === 'frontmatter') {
        if (isMarkdownFile(f.path)) modes.set(f.path, 'frontmatter')
      }
    }
  }

  return modes
}

/** Walk directory tree: children sorted by name; dirs before files in name order (mixed sort). */
export function walkFilePathsInTreeOrder(snapshot: VfsSnapshot): string[] {
  const root = snapshot.nodes[snapshot.rootId]
  if (!root || root.type !== 'directory') return []
  const out: string[] = []

  const visit = (dir: VfsDirectoryNodeSnapshot) => {
    const children = dir.children.map((id) => snapshot.nodes[id]).filter(Boolean) as VfsNodeSnapshot[]
    children.sort((a, b) => a.name.localeCompare(b.name))
    for (const node of children) {
      if (node.type === 'directory') visit(node)
      else out.push(node.path)
    }
  }
  visit(root)
  return out
}

function numberedBody(lines: string[]): string {
  return lines.map((line, i) => `${i + 1}|${line}`).join('\n')
}

function renderOneFile(snapshot: VfsSnapshot, path: string, mode: RenderMode): string | null {
  const node = getNodeByPath(snapshot, path)
  if (!node || node.type !== 'file') return null

  const updatedAt = formatMacroTimestamp(node.mtime)
  const createdAt = formatMacroTimestamp(node.ctime)
  const updatedBy = node.updatedBy
  const pathAttr = escapeXmlAttr(path)

  if (mode === 'filename') {
    const body = numberedBody([vfsBasename(path)])
    return `<file path="${pathAttr}" updatedAt="${updatedAt}" createdAt="${createdAt}" updatedBy="${updatedBy}">\n${body}\n</file>`
  }

  const text = codec.decode(node.content)

  if (mode === 'frontmatter') {
    if (!isMarkdownFile(path)) return null
    const fmLines = frontMatterDisplayLines(text)
    if (!fmLines) return null
    const body = numberedBody(fmLines)
    return `<file path="${pathAttr}" updatedAt="${updatedAt}" createdAt="${createdAt}" updatedBy="${updatedBy}">\n${body}\n</file>`
  }

  const lines = text.split('\n')
  const body = numberedBody(lines)
  return `<file path="${pathAttr}" updatedAt="${updatedAt}" createdAt="${createdAt}" updatedBy="${updatedBy}">\n${body}\n</file>`
}

/**
 * Build the macro string for the current snapshot + config. Empty string if `workTree` is null.
 */
export function renderVirtualWorkTree(snapshot: VfsSnapshot, workTree: WorkTreeConfig | null): string {
  if (!workTree) return ''
  const modes = buildRenderModes(snapshot, workTree)
  const order = walkFilePathsInTreeOrder(snapshot)
  const blocks: string[] = []
  for (const p of order) {
    const mode = modes.get(p)
    if (!mode) continue
    const piece = renderOneFile(snapshot, p, mode)
    if (piece) blocks.push(piece)
  }
  return blocks.join('\n\n')
}
