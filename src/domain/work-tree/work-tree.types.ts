/**
 * @file Work-tree configuration types for `VIRTUAL_WORK_TREE` rendering.
 *
 * v2 (`schemaVersion: 2`): file inclusion modes + per-directory rules. Legacy v1 keys are rejected
 * at parse time — no field migration (see iteration SPEC).
 */
import { ROOT_PATH } from '@/domain/vfs/path-utils'

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

/** Sparse: omitted path means `follow-parent` (PRD default). */
export type WorkTreeFileInclusionMode = 'explicit-include' | 'explicit-exclude' | 'follow-parent'

export interface WorkTreeConfig {
  schemaVersion: 2
  fileInclusionByPath: Record<string, WorkTreeFileInclusionMode>
  /** Rule body used when this directory is the *direct parent* of a `follow-parent` file. */
  directoryRuleByPath: Record<string, DirectoryRule>
  /**
   * Non-root only: gate whether `directoryRuleByPath[dir]` applies to direct children.
   * WHY: `/` is always logically enabled; never persist `false` for `ROOT_PATH` (SPEC).
   * Semantics: **omitted path = gate on** (default). Persist **`false`** only when the user explicitly turns the directory off.
   */
  directoryRuleEnabledByPath: Record<string, boolean>
}

/** Whether `directoryRuleByPath` applies to this directory's direct children (`follow-parent` files). Root is always on. */
export function isWorkTreeDirectoryRuleGateOn(config: WorkTreeConfig, directoryPath: string): boolean {
  if (directoryPath === ROOT_PATH) return true
  return config.directoryRuleEnabledByPath[directoryPath] !== false
}

/** Default body for `/` and fallback when a directory has no stored rule. */
export const DEFAULT_ROOT_DIRECTORY_RULE: DirectoryRule = {
  sortField: 'name',
  sortDirection: 'asc',
  headCount: 1000,
  tailCount: 0,
  fill: 'omit',
}

/** @deprecated Use DEFAULT_ROOT_DIRECTORY_RULE / createDefaultWorkTreeConfig; kept for grep/docs alignment. */
export const DEFAULT_DIRECTORY_RULE: DirectoryRule = { ...DEFAULT_ROOT_DIRECTORY_RULE, headCount: 0 }

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
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_ROOT_DIRECTORY_RULE }
  const o = raw as Record<string, unknown>
  return {
    sortField: asSortField(o.sortField),
    sortDirection: asSortDirection(o.sortDirection),
    headCount: clampHeadTail(typeof o.headCount === 'number' ? o.headCount : Number(o.headCount)),
    tailCount: clampHeadTail(typeof o.tailCount === 'number' ? o.tailCount : Number(o.tailCount)),
    fill: asFill(o.fill),
  }
}

function asInclusionMode(v: unknown): WorkTreeFileInclusionMode | null {
  if (v === 'explicit-include' || v === 'explicit-exclude' || v === 'follow-parent') return v
  return null
}

const LEGACY_WORK_TREE_KEYS = ['selectedFiles', 'defaultRule', 'directoryOverrides', 'directoryRulesEnabled'] as const

function hasLegacyWorkTreeKeys(o: Record<string, unknown>): boolean {
  return LEGACY_WORK_TREE_KEYS.some((k) => k in o)
}

/**
 * Parse persisted work-tree config. Returns `null` for absent objects, non-v2, or legacy shapes
 * so callers can replace with `ensureWorkTreeConfig` defaults (SPEC: no silent dual-track).
 */
export function parseWorkTreeConfig(raw: unknown): WorkTreeConfig | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (hasLegacyWorkTreeKeys(o)) return null
  if (typeof o.schemaVersion !== 'number' || o.schemaVersion < 2) return null

  const fileInclusionByPath: Record<string, WorkTreeFileInclusionMode> = {}
  if (o.fileInclusionByPath && typeof o.fileInclusionByPath === 'object') {
    for (const [k, v] of Object.entries(o.fileInclusionByPath as Record<string, unknown>)) {
      const m = asInclusionMode(v)
      if (m) fileInclusionByPath[k] = m
    }
  }

  const directoryRuleByPath: Record<string, DirectoryRule> = {}
  if (o.directoryRuleByPath && typeof o.directoryRuleByPath === 'object') {
    for (const [k, v] of Object.entries(o.directoryRuleByPath as Record<string, unknown>)) {
      directoryRuleByPath[k] = parseDirectoryRule(v)
    }
  }

  const directoryRuleEnabledByPath: Record<string, boolean> = {}
  if (o.directoryRuleEnabledByPath && typeof o.directoryRuleEnabledByPath === 'object') {
    for (const [k, v] of Object.entries(o.directoryRuleEnabledByPath as Record<string, unknown>)) {
      if (k === ROOT_PATH) continue // WHY: root is always-on; ignore any persisted root gate.
      if (v === true) directoryRuleEnabledByPath[k] = true
      else if (v === false) directoryRuleEnabledByPath[k] = false
    }
  }

  return normalizeWorkTreeConfig({
    schemaVersion: 2,
    fileInclusionByPath,
    directoryRuleByPath,
    directoryRuleEnabledByPath,
  })
}

/** Factory for new chats / template defaults / parse `null` fallback. */
export function createDefaultWorkTreeConfig(): WorkTreeConfig {
  return normalizeWorkTreeConfig({
    schemaVersion: 2,
    fileInclusionByPath: {},
    directoryRuleByPath: { [ROOT_PATH]: { ...DEFAULT_ROOT_DIRECTORY_RULE } },
    directoryRuleEnabledByPath: {},
  })
}

export function normalizeWorkTreeConfig(config: WorkTreeConfig): WorkTreeConfig {
  const directoryRuleByPath: Record<string, DirectoryRule> = { ...config.directoryRuleByPath }
  directoryRuleByPath[ROOT_PATH] = { ...DEFAULT_ROOT_DIRECTORY_RULE, ...directoryRuleByPath[ROOT_PATH] }

  const directoryRuleEnabledByPath: Record<string, boolean> = {}
  for (const [k, v] of Object.entries(config.directoryRuleEnabledByPath)) {
    if (k === ROOT_PATH) continue
    if (v === true) directoryRuleEnabledByPath[k] = true
    else if (v === false) directoryRuleEnabledByPath[k] = false
  }

  const fileInclusionByPath: Record<string, WorkTreeFileInclusionMode> = {}
  for (const [k, v] of Object.entries(config.fileInclusionByPath)) {
    if (v === 'follow-parent') continue
    fileInclusionByPath[k] = v
  }

  return {
    schemaVersion: 2,
    fileInclusionByPath,
    directoryRuleByPath,
    directoryRuleEnabledByPath,
  }
}

export function ensureWorkTreeConfig(existing: WorkTreeConfig | null | undefined): WorkTreeConfig {
  if (!existing || existing.schemaVersion !== 2) return createDefaultWorkTreeConfig()
  return normalizeWorkTreeConfig(existing)
}

/** Serialize v2 only — no legacy keys (SPEC). */
export function serializeWorkTreeConfig(config: WorkTreeConfig): Record<string, unknown> {
  const normalized = normalizeWorkTreeConfig(config)
  const enabledOut: Record<string, boolean> = {}
  for (const [k, v] of Object.entries(normalized.directoryRuleEnabledByPath)) {
    if (k === ROOT_PATH) continue
    if (v === true) enabledOut[k] = true
    else if (v === false) enabledOut[k] = false
  }
  return {
    schemaVersion: 2,
    fileInclusionByPath: { ...normalized.fileInclusionByPath },
    directoryRuleByPath: Object.fromEntries(
      Object.entries(normalized.directoryRuleByPath).map(([k, v]) => [k, { ...v }]),
    ),
    directoryRuleEnabledByPath: enabledOut,
  }
}
