/**
 * @file Work-tree configuration types for `VIRTUAL_WORK_TREE` rendering.
 *
 * Chat-level config selects which VFS files appear in prompts and how (full text, filename only,
 * FrontMatter). Directory rules apply only to **direct child files** of a path when that folder's
 * rule gate is enabled (`directoryRulesEnabled`).
 */
export type WorkTreeSortField = 'name' | 'ctime' | 'mtime'
export type WorkTreeSortDirection = 'asc' | 'desc'
export type WorkTreeFillStrategy = 'filename' | 'frontmatter' | 'omit'

export interface DirectoryRule {
  sortField: WorkTreeSortField
  sortDirection: WorkTreeSortDirection
  headCount: number
  tailCount: number
  fill: WorkTreeFillStrategy
}

export interface WorkTreeConfig {
  defaultRule: DirectoryRule
  directoryOverrides: Record<string, DirectoryRule>
  /**
   * When true for a directory path, that folder's `directoryOverrides[path] ?? defaultRule`
   * participates in picking non–selected-files. When false/undefined, directory rules for that
   * folder are skipped (spec: folder read only gates rules).
   */
  directoryRulesEnabled: Record<string, boolean>
  /** Normalized absolute VFS paths; always full file content in output. */
  selectedFiles: string[]
}

export const DEFAULT_DIRECTORY_RULE: DirectoryRule = {
  sortField: 'name',
  sortDirection: 'asc',
  headCount: 0,
  tailCount: 0,
  fill: 'omit',
}

function clampHeadTail(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.min(1000, Math.floor(n))
}

function asSortField(v: unknown): WorkTreeSortField {
  return v === 'ctime' || v === 'mtime' ? v : 'name'
}

function asSortDirection(v: unknown): WorkTreeSortDirection {
  return v === 'desc' ? 'desc' : 'asc'
}

function asFill(v: unknown): WorkTreeFillStrategy {
  return v === 'frontmatter' || v === 'omit' ? v : v === 'filename' ? 'filename' : 'omit'
}

function parseDirectoryRule(raw: unknown): DirectoryRule {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_DIRECTORY_RULE }
  const o = raw as Record<string, unknown>
  return {
    sortField: asSortField(o.sortField),
    sortDirection: asSortDirection(o.sortDirection),
    headCount: clampHeadTail(typeof o.headCount === 'number' ? o.headCount : Number(o.headCount)),
    tailCount: clampHeadTail(typeof o.tailCount === 'number' ? o.tailCount : Number(o.tailCount)),
    fill: asFill(o.fill),
  }
}

/** Parse persisted work-tree config; returns `null` when absent or not an object. */
export function parseWorkTreeConfig(raw: unknown): WorkTreeConfig | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>

  const defaultRule = parseDirectoryRule(o.defaultRule)

  const directoryOverrides: Record<string, DirectoryRule> = {}
  if (o.directoryOverrides && typeof o.directoryOverrides === 'object') {
    for (const [k, v] of Object.entries(o.directoryOverrides as Record<string, unknown>)) {
      directoryOverrides[k] = parseDirectoryRule(v)
    }
  }

  const directoryRulesEnabled: Record<string, boolean> = {}
  if (o.directoryRulesEnabled && typeof o.directoryRulesEnabled === 'object') {
    for (const [k, v] of Object.entries(o.directoryRulesEnabled as Record<string, unknown>)) {
      directoryRulesEnabled[k] = v === true
    }
  }

  const selectedFiles: string[] = []
  if (Array.isArray(o.selectedFiles)) {
    for (const item of o.selectedFiles) {
      if (typeof item === 'string' && item.length > 0) selectedFiles.push(item)
    }
  }

  return {
    defaultRule,
    directoryOverrides,
    directoryRulesEnabled,
    selectedFiles,
  }
}

export function serializeWorkTreeConfig(config: WorkTreeConfig): Record<string, unknown> {
  return {
    defaultRule: { ...config.defaultRule },
    directoryOverrides: { ...config.directoryOverrides },
    directoryRulesEnabled: { ...config.directoryRulesEnabled },
    selectedFiles: [...config.selectedFiles],
  }
}
