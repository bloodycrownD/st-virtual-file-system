import type { VfsSnapshot } from '@/domain/vfs/types'

/**
 * @file Snapshot persistence boundary.
 *
 * This interface represents the minimal contract required by the app layer:
 * - load the most recently saved full snapshot
 * - save a full snapshot
 *
 * It deliberately hides the underlying storage (SillyTavern metadata, memory, IndexedDB, HTTP,
 * etc.). Methods are `async` to keep the app layer compatible with future asynchronous backends.
 */
export interface VfsSnapshotRepository {
  /** 读取最近一次保存的快照；无数据时返回 null。 */
  load(): Promise<VfsSnapshot | null>
  /** 持久化当前完整快照。 */
  save(snapshot: VfsSnapshot): Promise<void>
}
