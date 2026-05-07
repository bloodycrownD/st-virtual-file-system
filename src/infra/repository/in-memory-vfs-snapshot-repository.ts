import type { VfsSnapshot } from '@/domain/vfs/types'
import type { VfsSnapshotRepository } from './vfs-snapshot-repository'

/** 用 JSON 深拷贝隔离引用，避免调用方意外篡改仓储内部状态。 */
function cloneSnapshot(snapshot: VfsSnapshot): VfsSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as VfsSnapshot
}

/** 仅用于本地运行/测试的内存仓储实现，不做跨会话持久化。 */
export class InMemoryVfsSnapshotRepository implements VfsSnapshotRepository {
  private snapshot: VfsSnapshot | null

  constructor(initialSnapshot: VfsSnapshot | null = null) {
    this.snapshot = initialSnapshot ? cloneSnapshot(initialSnapshot) : null
  }

  async load(): Promise<VfsSnapshot | null> {
    // 返回副本而不是原对象，确保外部修改不会污染仓储缓存。
    return this.snapshot ? cloneSnapshot(this.snapshot) : null
  }

  async save(snapshot: VfsSnapshot): Promise<void> {
    // 保存时同样拷贝一份，避免调用方后续修改传入对象。
    this.snapshot = cloneSnapshot(snapshot)
  }
}
