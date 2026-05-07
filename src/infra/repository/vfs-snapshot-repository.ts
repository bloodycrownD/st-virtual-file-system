import type { VfsSnapshot } from '@/domain/vfs/types'

/**
 * VFS 快照仓储抽象：
 * - 只关心“整包快照”的读写，不关心底层是 ST、内存还是数据库。
 * - 使用 async 是为了让上层代码对未来异步后端（IndexedDB/HTTP）保持兼容。
 */
export interface VfsSnapshotRepository {
  /** 读取最近一次保存的快照；无数据时返回 null。 */
  load(): Promise<VfsSnapshot | null>
  /** 持久化当前完整快照。 */
  save(snapshot: VfsSnapshot): Promise<void>
}
