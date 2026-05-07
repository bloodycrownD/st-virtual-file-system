import { VfsCore } from '@/domain/vfs/vfs-core'
import { DeflateContentCodec } from '@/infra/serialization/deflate-codec'
import { InMemoryVfsSnapshotRepository } from '@/infra/repository/in-memory-vfs-snapshot-repository'
import type { VfsSnapshotRepository } from '@/infra/repository/vfs-snapshot-repository'
import type { VfsSnapshot } from '@/domain/vfs/types'
import { VfsService } from './vfs-service'

/**
 * @file Factory wiring for a ready-to-use `VfsService`.
 *
 * This is the central composition point that chooses defaults (codec + repository) while allowing
 * callers (tests / future integrations) to override pieces.
 */
export interface VfsServiceFactoryOptions {
  /** Minimum UTF-8 byte length before content is compressed. */
  compressionThreshold?: number
  /** Custom snapshot repository; defaults to an in-memory repository. */
  repository?: VfsSnapshotRepository
  /** Initial snapshot used by the default in-memory repository. */
  initialSnapshot?: VfsSnapshot | null
}

/**
 * Creates a fully-wired `VfsService`.
 *
 * @param options - Optional overrides for compression and persistence.
 */
export function createVfsService(options: VfsServiceFactoryOptions = {}): VfsService {
  const codec = new DeflateContentCodec({
    threshold: options.compressionThreshold,
  })
  const repository =
    options.repository ?? new InMemoryVfsSnapshotRepository(options.initialSnapshot ?? null)
  const core = new VfsCore(codec)
  return new VfsService(core, repository)
}
