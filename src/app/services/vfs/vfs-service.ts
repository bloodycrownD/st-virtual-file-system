import type { VfsCore } from '@/domain/vfs/vfs-core'
import type { VfsDeleteOptions, VfsListItem, VfsSnapshot, VfsStat, VfsWriteOptions } from '@/domain/vfs/types'
import { parseVfsSnapshot } from '@/infra/persistence/vfs-snapshot.schema'
import type { VfsSnapshotRepository } from '@/infra/repository/vfs-snapshot-repository'

/**
 * @file Application-layer façade for VFS operations.
 *
 * `VfsService` exposes a stable, "filesystem-like" API to the rest of the extension while keeping
 * implementation details split:
 *
 * - `VfsCore`: pure domain logic (paths, nodes, file operations).
 * - `VfsSnapshotRepository`: persistence boundary (where snapshots are loaded/saved).
 *
 * The service itself is intentionally thin: most methods directly delegate to `VfsCore`.
 */
export class VfsService {
  constructor(
    private readonly core: VfsCore,
    private readonly repository: VfsSnapshotRepository,
  ) {}

  /** Create a directory at `path`. */
  mkdir(path: string, options?: { recursive?: boolean }): void {
    this.core.mkdir(path, options)
  }

  /** List direct children under `path`. */
  list(path: string): VfsListItem[] {
    return this.core.list(path)
  }

  /** Read a text file at `path`. */
  readFile(path: string): string {
    return this.core.readFile(path)
  }

  /** Write a text file at `path`, optionally creating parents depending on options. */
  writeFile(path: string, content: string, options?: VfsWriteOptions): void {
    this.core.writeFile(path, content, options)
  }

  /** Delete a file or directory at `path` (see options for recursive behavior). */
  delete(path: string, options?: VfsDeleteOptions): void {
    this.core.delete(path, options)
  }

  /** Check whether a node exists at `path`. */
  exists(path: string): boolean {
    return this.core.exists(path)
  }

  /** Move a node from `sourcePath` to `destinationPath`. */
  move(sourcePath: string, destinationPath: string): void {
    this.core.move(sourcePath, destinationPath)
  }

  /** Rename the final segment of `path` to `newName`. */
  rename(path: string, newName: string): void {
    this.core.rename(path, newName)
  }

  /** Copy a node from `sourcePath` to `destinationPath`. */
  copy(sourcePath: string, destinationPath: string): void {
    this.core.copy(sourcePath, destinationPath)
  }

  /** Create an empty file or update its mtime (implementation-defined). */
  touch(path: string): void {
    this.core.touch(path)
  }

  /** Get stat information for `path`. */
  stat(path: string): VfsStat {
    return this.core.stat(path)
  }

  /** Depth-first walk returning stats under `path` (or root when omitted). */
  walk(path?: string): VfsStat[] {
    return this.core.walk(path)
  }

  /** Export a complete snapshot of the current in-memory filesystem. */
  exportSnapshot(): VfsSnapshot {
    return this.core.exportSnapshot()
  }

  /**
   * Import a snapshot into the in-memory filesystem.
   *
   * The snapshot is normalized through the schema parser to ensure it is safe and well-formed
   * before reaching the core.
   */
  importSnapshot(snapshot: VfsSnapshot): void {
    // 统一走 schema 解析，避免外部直接塞入脏结构。
    this.core.importSnapshot(parseVfsSnapshot(snapshot))
  }

  /** Persist the current full snapshot via the configured repository. */
  async save(): Promise<void> {
    // 当前是整包快照保存，后续可替换为增量策略而不影响调用方。
    await this.repository.save(this.exportSnapshot())
  }

  /** Load the latest saved snapshot (if any) and import it into memory. */
  async load(): Promise<void> {
    const snapshot = await this.repository.load()
    if (!snapshot) return
    this.importSnapshot(snapshot)
  }
}
