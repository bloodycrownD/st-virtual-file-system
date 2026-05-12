import type { VfsSnapshot } from '@/domain/vfs/types'

export type ChatVfsSnapshotKind = 'manual' | 'tool-batch-pre'

export type VfsPathPresence = 'absent' | 'present'

/**
 * One path row in a snapshot manifest (pre-batch anchor state).
 * WHY: `subtree` is a minimal importable `VfsSnapshot` slice for `presence === 'present'`.
 */
export interface VfsPathSnapshotEntry {
  path: string
  presence: VfsPathPresence
  subtree?: VfsSnapshot
}

export interface ChatVfsSnapshotRecord {
  id: string
  time: string
  kind: ChatVfsSnapshotKind
  entries: VfsPathSnapshotEntry[]
}
