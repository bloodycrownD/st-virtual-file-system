import type { VfsCore } from '@/domain/vfs/vfs-core'
import type { VfsDeleteOptions, VfsListItem, VfsSnapshot, VfsStat, VfsWriteOptions } from '@/domain/vfs/types'
import { parseVfsSnapshot } from '@/infra/persistence/vfs-snapshot.schema'
import type { VfsSnapshotRepository } from '@/infra/repository/vfs-snapshot-repository'

/**
 * 应用层门面：
 * - 对外暴露“文件系统语义”API；
 * - 把 core（语义）与 repository（持久化）拼装在一起。
 */
export class VfsService {
  constructor(
    private readonly core: VfsCore,
    private readonly repository: VfsSnapshotRepository,
  ) {}

  mkdir(path: string, options?: { recursive?: boolean }): void {
    this.core.mkdir(path, options)
  }

  list(path: string): VfsListItem[] {
    return this.core.list(path)
  }

  readFile(path: string): string {
    return this.core.readFile(path)
  }

  writeFile(path: string, content: string, options?: VfsWriteOptions): void {
    this.core.writeFile(path, content, options)
  }

  delete(path: string, options?: VfsDeleteOptions): void {
    this.core.delete(path, options)
  }

  exists(path: string): boolean {
    return this.core.exists(path)
  }

  move(sourcePath: string, destinationPath: string): void {
    this.core.move(sourcePath, destinationPath)
  }

  rename(path: string, newName: string): void {
    this.core.rename(path, newName)
  }

  copy(sourcePath: string, destinationPath: string): void {
    this.core.copy(sourcePath, destinationPath)
  }

  touch(path: string): void {
    this.core.touch(path)
  }

  stat(path: string): VfsStat {
    return this.core.stat(path)
  }

  walk(path?: string): VfsStat[] {
    return this.core.walk(path)
  }

  exportSnapshot(): VfsSnapshot {
    return this.core.exportSnapshot()
  }

  importSnapshot(snapshot: VfsSnapshot): void {
    // 统一走 schema 解析，避免外部直接塞入脏结构。
    this.core.importSnapshot(parseVfsSnapshot(snapshot))
  }

  async save(): Promise<void> {
    // 当前是整包快照保存，后续可替换为增量策略而不影响调用方。
    await this.repository.save(this.exportSnapshot())
  }

  async load(): Promise<void> {
    const snapshot = await this.repository.load()
    if (!snapshot) return
    this.importSnapshot(snapshot)
  }
}
