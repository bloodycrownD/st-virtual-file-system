import { VfsCore } from '@/domain/vfs/vfs-core'
import { DeflateContentCodec } from '@/infra/serialization/deflate-codec'
import { InMemoryVfsSnapshotRepository } from '@/infra/repository/in-memory-vfs-snapshot-repository'
import type { VfsSnapshotRepository } from '@/infra/repository/vfs-snapshot-repository'
import type { VfsSnapshot } from '@/domain/vfs/types'
import { VfsService } from './vfs-service'

export interface VfsServiceFactoryOptions {
  compressionThreshold?: number
  repository?: VfsSnapshotRepository
  initialSnapshot?: VfsSnapshot | null
}

export function createVfsService(options: VfsServiceFactoryOptions = {}): VfsService {
  const codec = new DeflateContentCodec({
    threshold: options.compressionThreshold,
  })
  const repository =
    options.repository ?? new InMemoryVfsSnapshotRepository(options.initialSnapshot ?? null)
  const core = new VfsCore(codec)
  return new VfsService(core, repository)
}
