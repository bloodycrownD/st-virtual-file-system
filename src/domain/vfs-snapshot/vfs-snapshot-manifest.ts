import { VfsCore } from '@/domain/vfs/vfs-core'
import type { VfsDirectoryNodeSnapshot, VfsFileNodeSnapshot, VfsNodeSnapshot, VfsSnapshot } from '@/domain/vfs/types'
import { normalizePath, ROOT_PATH } from '@/domain/vfs/path-utils'
import type { VfsPathSnapshotEntry } from '@/domain/vfs-snapshot/vfs-snapshot-types'
import { serializeVfsSnapshot } from '@/infra/persistence/vfs-snapshot.schema'
import { collectPathsFromSnapshot, sortPathsForAbsentApply, sortPathsForPresentApply } from '@/domain/vfs-snapshot/vfs-snapshot-paths'

function getNodeAtPath(snapshot: VfsSnapshot, path: string): VfsNodeSnapshot | null {
  const p = normalizePath(path)
  for (const node of Object.values(snapshot.nodes)) {
    if (normalizePath(node.path) === p) return node
  }
  return null
}

function collectSubtreeNodeIds(snapshot: VfsSnapshot, rootId: string): Set<string> {
  const ids = new Set<string>()
  const walk = (id: string): void => {
    if (ids.has(id)) return
    ids.add(id)
    const node = snapshot.nodes[id]
    if (!node) return
    if (node.type === 'directory') {
      for (const childId of node.children) walk(childId)
    }
  }
  walk(rootId)
  return ids
}

/**
 * Build a valid `VfsSnapshot` slice rooted at `path`, including ancestor chain to `/`
 * with directory `children` filtered to the slice only.
 * WHY: persisted manifest subtrees must re-import through `VfsCore` without carrying unrelated siblings.
 */
export function extractSubtreeSnapshot(full: VfsSnapshot, path: string): VfsSnapshot {
  const normalized = normalizePath(path)
  const target = getNodeAtPath(full, normalized)
  if (!target) {
    throw new Error(`extractSubtreeSnapshot: path not found: ${normalized}`)
  }
  const subtreeIds = collectSubtreeNodeIds(full, target.id)
  let cursor: VfsNodeSnapshot | null = target
  while (cursor && cursor.parentId) {
    subtreeIds.add(cursor.parentId)
    cursor = full.nodes[cursor.parentId] ?? null
  }
  subtreeIds.add(full.rootId)

  const nodes: Record<string, VfsNodeSnapshot> = {}
  for (const id of subtreeIds) {
    const raw = full.nodes[id]
    if (!raw) continue
    if (raw.type === 'directory') {
      const dir = raw as VfsDirectoryNodeSnapshot
      const filteredChildren = dir.children.filter((childId) => subtreeIds.has(childId))
      nodes[id] = { ...dir, children: filteredChildren }
    } else {
      nodes[id] = { ...(raw as VfsFileNodeSnapshot) }
    }
  }
  return serializeVfsSnapshot({
    schemaVersion: 1,
    rootId: full.rootId,
    nodes,
  })
}

export function buildManifestEntriesFromBefore(before: VfsSnapshot, changedPaths: string[]): VfsPathSnapshotEntry[] {
  const unique = [...new Set(changedPaths.map((p) => normalizePath(p)))].filter((p) => p !== ROOT_PATH).sort((a, b) =>
    a.localeCompare(b),
  )
  const entries: VfsPathSnapshotEntry[] = []
  for (const path of unique) {
    const node = getNodeAtPath(before, path)
    if (!node) {
      entries.push({ path, presence: 'absent' })
      continue
    }
    entries.push({
      path,
      presence: 'present',
      subtree: extractSubtreeSnapshot(before, path),
    })
  }
  return entries
}

function materializeSubtreeIntoCore(core: VfsCore, subtree: VfsSnapshot): void {
  const temp = new VfsCore(core.getCodec())
  temp.importSnapshot(subtree)
  const paths = collectPathsFromSnapshot(subtree).filter((p) => p !== ROOT_PATH)
  const ordered = sortPathsForPresentApply(paths)
  for (const p of ordered) {
    if (!temp.exists(p)) continue
    const st = temp.stat(p)
    if (st.type === 'directory') {
      if (!core.exists(p)) {
        core.mkdir(p, { recursive: true })
      }
      continue
    }
    const node = getNodeAtPath(subtree, p) as VfsFileNodeSnapshot | null
    const attribution = node?.updatedBy === 'assistant' ? 'assistant' : 'user'
    const content = temp.readFile(p)
    core.writeFile(p, content, { createParents: true, updatedBy: attribution })
  }
}

/**
 * Apply manifest entries to a working `VfsCore` imported from the current authoritative snapshot.
 * WHY: order is part of the rollback contract — absent paths first (deepest deletes), then present slices shallow→deep.
 */
export function applyManifestEntriesToCore(core: VfsCore, entries: VfsPathSnapshotEntry[]): void {
  const absentPaths = entries.filter((e) => e.presence === 'absent').map((e) => normalizePath(e.path))
  const presentEntries = entries.filter((e) => e.presence === 'present')
  for (const p of sortPathsForAbsentApply(absentPaths)) {
    if (core.exists(p)) {
      core.delete(p, { recursive: true })
    }
  }
  const presentPaths = presentEntries.map((e) => normalizePath(e.path))
  for (const p of sortPathsForPresentApply(presentPaths)) {
    const entry = presentEntries.find((e) => normalizePath(e.path) === p)
    if (!entry?.subtree) {
      throw new Error(`applyManifestEntriesToCore: missing subtree for present path ${p}`)
    }
    if (core.exists(p)) {
      core.delete(p, { recursive: true })
    }
    materializeSubtreeIntoCore(core, entry.subtree)
  }
}
