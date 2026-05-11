/**
 * @file Pure work-tree rendering for `{{VIRTUAL_WORK_TREE}}`.
 *
 * Inputs: a persisted `VfsSnapshot` plus chat `WorkTreeConfig` (v2). No I/O; decoding uses the same
 * deflate/plain codec as runtime VFS so macro output matches tool-written files.
 */
import type { VfsSnapshot, VfsDirectoryNodeSnapshot, VfsFileNodeSnapshot, VfsNodeSnapshot } from '@/domain/vfs/types'
import { normalizePath, basename as vfsBasename, dirname, ROOT_PATH } from '@/domain/vfs/path-utils'
import { DeflateContentCodec } from '@/infra/serialization/deflate-codec'
import type { DirectoryRule, WorkTreeConfig, WorkTreeFileInclusionMode } from '@/domain/work-tree/work-tree.types'
import { DEFAULT_ROOT_DIRECTORY_RULE, ensureWorkTreeConfig } from '@/domain/work-tree/work-tree.types'

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
  if (field === 'name') return f.name
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
    if (c === 0) c = a.path.localeCompare(b.path)
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

export type WorkTreeFileRenderMode = 'full' | 'filename' | 'frontmatter'

export interface WorkTreeFileRowState {
  included: boolean
  /** Meaningful when `included` is true (UI may still read for edge tooling). */
  renderMode: WorkTreeFileRenderMode
}

function getFileInclusionMode(config: WorkTreeConfig, filePath: string): WorkTreeFileInclusionMode {
  return config.fileInclusionByPath[filePath] ?? 'follow-parent'
}

function effectiveDirectoryRule(config: WorkTreeConfig, directoryPath: string): DirectoryRule {
  return { ...DEFAULT_ROOT_DIRECTORY_RULE, ...config.directoryRuleByPath[directoryPath] }
}

/**
 * Single source of truth for macro + UI lamp: inclusion + render mode for one file.
 */
export function resolveWorkTreeFileRowState(
  snapshot: VfsSnapshot,
  config: WorkTreeConfig,
  filePath: string,
): WorkTreeFileRowState {
  const path = normalizePath(filePath)
  const node = getNodeByPath(snapshot, path)
  if (!node || node.type !== 'file') return { included: false, renderMode: 'full' }

  const normalized = ensureWorkTreeConfig(config)
  const mode = getFileInclusionMode(normalized, path)

  if (mode === 'explicit-exclude') return { included: false, renderMode: 'full' }
  if (mode === 'explicit-include') return { included: true, renderMode: 'full' }

  const parentPath = dirname(path)
  const parentEnabled =
    parentPath === ROOT_PATH ? true : normalized.directoryRuleEnabledByPath[parentPath] === true
  if (!parentEnabled) return { included: false, renderMode: 'full' }

  const rule = effectiveDirectoryRule(normalized, parentPath)
  const allChildren = directChildFiles(snapshot, parentPath)
  const followPool = allChildren.filter((f) => getFileInclusionMode(normalized, f.path) === 'follow-parent')
  const sorted = sortFiles(followPool, rule)
  const priorityPaths = pickHeadTailPaths(sorted, rule.headCount, rule.tailCount)

  if (priorityPaths.has(path)) return { included: true, renderMode: 'full' }
  if (rule.fill === 'omit') return { included: false, renderMode: 'full' }
  if (rule.fill === 'filename') return { included: true, renderMode: 'filename' }
  if (rule.fill === 'frontmatter') {
    if (!isMarkdownFile(path)) return { included: false, renderMode: 'full' }
    return { included: true, renderMode: 'frontmatter' }
  }
  return { included: false, renderMode: 'full' }
}

export function isFileIncludedInWorkTree(snapshot: VfsSnapshot, config: WorkTreeConfig | null, filePath: string): boolean {
  if (!config) return false
  return resolveWorkTreeFileRowState(snapshot, config, filePath).included
}

type RenderMode = WorkTreeFileRenderMode

function buildRenderModes(snapshot: VfsSnapshot, config: WorkTreeConfig): Map<string, RenderMode> {
  const modes = new Map<string, RenderMode>()
  const normalized = ensureWorkTreeConfig(config)
  for (const node of Object.values(snapshot.nodes)) {
    if (node.type !== 'file') continue
    const st = resolveWorkTreeFileRowState(snapshot, normalized, node.path)
    if (st.included) modes.set(node.path, st.renderMode)
  }
  return modes
}

function buildEmissionOrder(snapshot: VfsSnapshot, config: WorkTreeConfig, modes: Map<string, RenderMode>): string[] {
  const normalized = ensureWorkTreeConfig(config)
  const root = snapshot.nodes[snapshot.rootId]
  if (!root || root.type !== 'directory') return []
  const out: string[] = []

  const listRuleForDirectory = (dirPath: string): DirectoryRule => {
    if (dirPath === ROOT_PATH) return effectiveDirectoryRule(normalized, ROOT_PATH)
    if (normalized.directoryRuleEnabledByPath[dirPath] !== true) {
      return { ...DEFAULT_ROOT_DIRECTORY_RULE, sortField: 'name', sortDirection: 'asc' }
    }
    return effectiveDirectoryRule(normalized, dirPath)
  }

  const sortNodeValue = (node: VfsNodeSnapshot, field: DirectoryRule['sortField']): string | number => {
    if (field === 'name') return node.name
    if (node.type === 'file') {
      return field === 'ctime' ? node.ctime : node.mtime
    }
    return node.mtime
  }

  const sortNodeCompare = (a: VfsNodeSnapshot, b: VfsNodeSnapshot, rule: DirectoryRule): number => {
    const dir = rule.sortDirection === 'desc' ? -1 : 1
    const va = sortNodeValue(a, rule.sortField)
    const vb = sortNodeValue(b, rule.sortField)
    let c = 0
    if (typeof va === 'number' && typeof vb === 'number') c = va === vb ? 0 : va < vb ? -1 : 1
    else c = String(va).localeCompare(String(vb))
    if (c === 0) c = a.path.localeCompare(b.path)
    return c * dir
  }

  const visit = (dir: VfsDirectoryNodeSnapshot): void => {
    const dirPath = dir.path
    const rule = listRuleForDirectory(dirPath)

    const children: VfsNodeSnapshot[] = dir.children
      .map((id) => snapshot.nodes[id])
      .filter(Boolean) as VfsNodeSnapshot[]

    children.sort((a, b) => sortNodeCompare(a, b, rule))

    for (const child of children) {
      if (child.type === 'directory') {
        visit(child)
      } else if (modes.has(child.path)) {
        out.push(child.path)
      }
    }
  }

  visit(root)
  return out
}

function numberedBody(lines: string[]): string {
  return lines.map((line, i) => `${i + 1}|${line}`).join('\n')
}

function frontMatterParseFailureLine(path: string): string {
  // WHY: product-stable downgrade string for md + frontmatter render mode when YAML delimiters fail.
  return `文件名${vfsBasename(path)}，FrontMatter解析失败`
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
    const bodyLines = fmLines ?? [frontMatterParseFailureLine(path)]
    const body = numberedBody(bodyLines)
    return `<file path="${pathAttr}" updatedAt="${updatedAt}" createdAt="${createdAt}" updatedBy="${updatedBy}">\n${body}\n</file>`
  }

  const lines = text.split('\n')
  const body = numberedBody(lines)
  return `<file path="${pathAttr}" updatedAt="${updatedAt}" createdAt="${createdAt}" updatedBy="${updatedBy}">\n${body}\n</file>`
}

/**
 * Build the macro string for the current snapshot + config.
 *
 * WHY: `chat.workTree` may be persisted `null` after legacy rejection while UI uses
 * `ensureWorkTreeConfig` defaults — normalizing here keeps `{{VIRTUAL_WORK_TREE}}` identical to
 * file-manager lamps (SPEC: single source of truth).
 */
export function renderVirtualWorkTree(snapshot: VfsSnapshot, workTree: WorkTreeConfig | null): string {
  const normalized = ensureWorkTreeConfig(workTree)
  const modes = buildRenderModes(snapshot, normalized)
  const order = buildEmissionOrder(snapshot, normalized, modes)
  const blocks: string[] = []
  for (const p of order) {
    const mode = modes.get(p)
    if (!mode) continue
    const piece = renderOneFile(snapshot, p, mode)
    if (piece) blocks.push(piece)
  }
  return blocks.join('\n\n')
}
