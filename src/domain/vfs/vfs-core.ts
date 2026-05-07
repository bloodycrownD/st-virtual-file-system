import { basename, dirname, joinPath, normalizePath, ROOT_PATH } from './path-utils'
import {
  VfsAlreadyExistsError,
  VfsInvalidPathError,
  VfsIsDirectoryError,
  VfsNotDirectoryError,
  VfsNotFoundError,
} from './vfs-errors'
import type {
  VfsDeleteOptions,
  VfsDirectoryNodeSnapshot,
  VfsFileNodeSnapshot,
  VfsListItem,
  VfsNodeSnapshot,
  VfsSnapshot,
  VfsStat,
  VfsWriteOptions,
} from './types'
import type { ContentCodec } from '@/infra/serialization/content-codec'
import { parseVfsSnapshot, serializeVfsSnapshot } from '@/infra/persistence/vfs-snapshot.schema'

export class VfsCore {
  private readonly codec: ContentCodec
  private nodes: Map<string, VfsNodeSnapshot> = new Map()
  private pathIndex: Map<string, string> = new Map()
  private idSeed = 1
  private readonly rootId = 'root'

  constructor(codec: ContentCodec) {
    this.codec = codec
    this.reset()
  }

  mkdir(path: string, options: { recursive?: boolean } = {}): void {
    const normalized = normalizePath(path)
    if (normalized === ROOT_PATH) return
    if (this.pathIndex.has(normalized)) throw new VfsAlreadyExistsError(`Path already exists: ${normalized}`)
    const segments = normalized.split('/').filter(Boolean)
    let cursor = ROOT_PATH
    for (let index = 0; index < segments.length; index += 1) {
      cursor = joinPath(cursor, segments[index])
      const exists = this.pathIndex.has(cursor)
      if (exists) continue
      if (!options.recursive && index < segments.length - 1) {
        throw new VfsNotFoundError(`Missing parent directory: ${cursor}`)
      }
      this.createDirectory(cursor)
    }
  }

  list(path: string): VfsListItem[] {
    const directory = this.mustGetDirectory(path)
    return directory.children
      .map((childId) => this.mustGetById(childId))
      .map((node) => this.toStat(node))
      .sort((left, right) => left.name.localeCompare(right.name))
  }

  readFile(path: string): string {
    const file = this.mustGetFile(path)
    return this.codec.decode(file.content)
  }

  writeFile(path: string, content: string, options: VfsWriteOptions = {}): void {
    const normalized = normalizePath(path)
    if (normalized === ROOT_PATH) throw new VfsIsDirectoryError('Cannot write root as file')
    const parentPath = dirname(normalized)
    if (!this.pathIndex.has(parentPath)) {
      if (options.createParents) {
        this.mkdir(parentPath, { recursive: true })
      } else {
        throw new VfsNotFoundError(`Parent directory not found: ${parentPath}`)
      }
    }
    const parent = this.mustGetDirectory(parentPath)
    const existsId = this.pathIndex.get(normalized)
    if (existsId) {
      const existing = this.mustGetById(existsId)
      if (existing.type !== 'file') throw new VfsIsDirectoryError(`Path is directory: ${normalized}`)
      existing.content = this.codec.encode(content)
      existing.size = content.length
      existing.mtime = Date.now()
      this.updateNode(existing)
      return
    }

    const node: VfsFileNodeSnapshot = {
      id: this.nextId(),
      type: 'file',
      path: normalized,
      name: basename(normalized),
      parentId: parent.id,
      size: content.length,
      content: this.codec.encode(content),
      mtime: Date.now(),
    }
    parent.children.push(node.id)
    parent.mtime = Date.now()
    this.updateNode(parent)
    this.addNode(node)
  }

  delete(path: string, options: VfsDeleteOptions = {}): void {
    const normalized = normalizePath(path)
    if (normalized === ROOT_PATH) throw new VfsInvalidPathError('Cannot delete root directory')
    const node = this.mustGetByPath(normalized)
    if (node.type === 'directory' && node.children.length > 0 && !options.recursive) {
      throw new VfsInvalidPathError(`Directory is not empty: ${normalized}`)
    }
    if (node.type === 'directory' && options.recursive) {
      for (const childId of [...node.children]) {
        const child = this.mustGetById(childId)
        this.delete(child.path, { recursive: true })
      }
    }
    this.removeNode(node)
  }

  exists(path: string): boolean {
    return this.pathIndex.has(normalizePath(path))
  }

  move(sourcePath: string, destinationPath: string): void {
    const normalizedSourcePath = normalizePath(sourcePath)
    if (normalizedSourcePath === ROOT_PATH) throw new VfsInvalidPathError('Cannot move root directory')
    const source = this.mustGetByPath(normalizedSourcePath)
    const sourceParent = this.mustGetDirectory(source.parentId ? this.mustGetById(source.parentId).path : ROOT_PATH)
    const target = this.resolveTargetPath(source, destinationPath)
    this.assertNotSelfOrDescendantTarget(source, target.path)
    this.assertTargetAvailable(target.path, source.id)
    sourceParent.children = sourceParent.children.filter((id) => id !== source.id)
    sourceParent.mtime = Date.now()
    this.updateNode(sourceParent)
    this.relocateNode(source, target.parent, target.name)
  }

  rename(path: string, newName: string): void {
    const normalized = normalizePath(path)
    if (normalized === ROOT_PATH) throw new VfsInvalidPathError('Cannot rename root directory')
    const parent = dirname(normalized)
    this.move(normalized, joinPath(parent, newName))
  }

  copy(sourcePath: string, destinationPath: string): void {
    const normalizedSourcePath = normalizePath(sourcePath)
    if (normalizedSourcePath === ROOT_PATH) throw new VfsInvalidPathError('Cannot copy root directory')
    const source = this.mustGetByPath(normalizedSourcePath)
    const target = this.resolveTargetPath(source, destinationPath)
    this.assertNotSelfOrDescendantTarget(source, target.path)
    this.assertTargetAvailable(target.path)
    this.cloneNodeRecursive(source, target.parent, target.name)
  }

  touch(path: string): void {
    const normalized = normalizePath(path)
    if (!this.pathIndex.has(normalized)) {
      this.writeFile(normalized, '', { createParents: true })
      return
    }
    const node = this.mustGetByPath(normalized)
    node.mtime = Date.now()
    this.updateNode(node)
  }

  stat(path: string): VfsStat {
    return this.toStat(this.mustGetByPath(normalizePath(path)))
  }

  walk(path = ROOT_PATH): VfsStat[] {
    const start = this.mustGetByPath(normalizePath(path))
    const result: VfsStat[] = []
    this.walkRecursive(start, result)
    return result.sort((left, right) => left.path.localeCompare(right.path))
  }

  exportSnapshot(): VfsSnapshot {
    return serializeVfsSnapshot({
      schemaVersion: 1,
      rootId: this.rootId,
      nodes: Object.fromEntries([...this.nodes.entries()]),
    })
  }

  importSnapshot(snapshot: VfsSnapshot): void {
    const parsed = parseVfsSnapshot(snapshot)
    this.validateSnapshotStructure(parsed)
    this.nodes = new Map(Object.entries(parsed.nodes))
    this.pathIndex = new Map()
    for (const [id, node] of this.nodes) {
      this.pathIndex.set(node.path, id)
    }
    this.recomputeIdSeed()
  }

  private reset(): void {
    this.nodes.clear()
    this.pathIndex.clear()
    const root: VfsDirectoryNodeSnapshot = {
      id: this.rootId,
      type: 'directory',
      path: ROOT_PATH,
      name: '',
      parentId: null,
      children: [],
      mtime: Date.now(),
    }
    this.addNode(root)
  }

  private walkRecursive(node: VfsNodeSnapshot, result: VfsStat[]): void {
    result.push(this.toStat(node))
    if (node.type === 'directory') {
      for (const childId of node.children) {
        this.walkRecursive(this.mustGetById(childId), result)
      }
    }
  }

  private resolveTargetPath(
    source: VfsNodeSnapshot,
    destinationPath: string,
  ): { path: string; parent: VfsDirectoryNodeSnapshot; name: string } {
    const normalizedDestination = normalizePath(destinationPath)
    const destinationId = this.pathIndex.get(normalizedDestination)
    if (destinationId) {
      const destinationNode = this.mustGetById(destinationId)
      if (destinationNode.type !== 'directory') {
        throw new VfsAlreadyExistsError(`Destination exists: ${normalizedDestination}`)
      }
      const targetPath = joinPath(normalizedDestination, source.name)
      return { path: targetPath, parent: destinationNode, name: source.name }
    }
    const parentPath = dirname(normalizedDestination)
    const parent = this.mustGetDirectory(parentPath)
    return { path: normalizedDestination, parent, name: basename(normalizedDestination) }
  }

  private assertTargetAvailable(path: string, allowedNodeId?: string): void {
    const existingId = this.pathIndex.get(path)
    if (existingId && existingId !== allowedNodeId) {
      throw new VfsAlreadyExistsError(`Destination exists: ${path}`)
    }
  }

  private assertNotSelfOrDescendantTarget(source: VfsNodeSnapshot, targetPath: string): void {
    if (source.type !== 'directory') return
    const isSelf = targetPath === source.path
    const isDescendant = source.path === ROOT_PATH ? targetPath.startsWith(ROOT_PATH) : targetPath.startsWith(`${source.path}/`)
    if (isSelf || isDescendant) {
      throw new VfsInvalidPathError(`Cannot move or copy directory into itself or its descendants: ${targetPath}`)
    }
  }

  private validateSnapshotStructure(snapshot: VfsSnapshot): void {
    const nodes = snapshot.nodes
    const nodeIdByNormalizedPath = new Map<string, string>()
    const rootNode = nodes[snapshot.rootId]
    if (!rootNode || rootNode.type !== 'directory') {
      throw new VfsInvalidPathError('Invalid snapshot: root node must exist and be a directory')
    }
    if (rootNode.path !== ROOT_PATH || rootNode.parentId !== null || rootNode.name !== '') {
      throw new VfsInvalidPathError('Invalid snapshot: root node integrity check failed')
    }

    for (const [id, node] of Object.entries(nodes)) {
      if (!id || node.id !== id) {
        throw new VfsInvalidPathError('Invalid snapshot: node id mapping mismatch')
      }
      if (!node.path || normalizePath(node.path) !== node.path) {
        throw new VfsInvalidPathError(`Invalid snapshot: malformed path for node ${id}`)
      }
      const normalizedPath = normalizePath(node.path)
      const existingNodeId = nodeIdByNormalizedPath.get(normalizedPath)
      if (existingNodeId && existingNodeId !== id) {
        throw new VfsInvalidPathError(
          `Invalid snapshot: duplicate normalized path "${normalizedPath}" for node IDs "${existingNodeId}" and "${id}"`,
        )
      }
      nodeIdByNormalizedPath.set(normalizedPath, id)
      if (typeof node.mtime !== 'number' || Number.isNaN(node.mtime)) {
        throw new VfsInvalidPathError(`Invalid snapshot: invalid mtime for node ${id}`)
      }

      if (node.type === 'directory') {
        for (const childId of node.children) {
          const child = nodes[childId]
          if (!child) {
            throw new VfsInvalidPathError(`Invalid snapshot: missing child node ${childId}`)
          }
          if (child.parentId !== node.id) {
            throw new VfsInvalidPathError(`Invalid snapshot: inconsistent parent link for child ${childId}`)
          }
        }
        continue
      }

      if (typeof node.size !== 'number' || node.size < 0) {
        throw new VfsInvalidPathError(`Invalid snapshot: invalid file size for node ${id}`)
      }
      if (!node.content || typeof node.content.data !== 'string') {
        throw new VfsInvalidPathError(`Invalid snapshot: invalid content for node ${id}`)
      }
      if (node.content.encoding !== 'plain' && node.content.encoding !== 'deflate-base64') {
        throw new VfsInvalidPathError(`Invalid snapshot: invalid content encoding for node ${id}`)
      }
      if (typeof node.content.originalSize !== 'number' || node.content.originalSize < 0) {
        throw new VfsInvalidPathError(`Invalid snapshot: invalid original size for node ${id}`)
      }
    }

    for (const [id, node] of Object.entries(nodes)) {
      if (id === snapshot.rootId) continue
      if (node.parentId === null) {
        throw new VfsInvalidPathError(`Invalid snapshot: non-root node ${id} has null parent`)
      }
      const parent = nodes[node.parentId]
      if (!parent || parent.type !== 'directory') {
        throw new VfsInvalidPathError(`Invalid snapshot: parent missing for node ${id}`)
      }
      if (!parent.children.includes(id)) {
        throw new VfsInvalidPathError(`Invalid snapshot: parent-child reference missing for node ${id}`)
      }
    }
  }

  private relocateNode(node: VfsNodeSnapshot, parent: VfsDirectoryNodeSnapshot, name: string): void {
    const oldPath = node.path
    node.parentId = parent.id
    node.name = name
    node.path = joinPath(parent.path, name)
    node.mtime = Date.now()
    parent.children.push(node.id)
    parent.mtime = Date.now()
    this.updateNode(parent)
    this.reindexPath(oldPath, node)

    if (node.type === 'directory') {
      for (const childId of node.children) {
        this.relocateChildPath(this.mustGetById(childId), oldPath, node.path)
      }
    }
    this.updateNode(node)
  }

  private relocateChildPath(node: VfsNodeSnapshot, oldBasePath: string, newBasePath: string): void {
    const oldPath = node.path
    node.path = `${newBasePath}${node.path.slice(oldBasePath.length)}`
    this.reindexPath(oldPath, node)
    if (node.type === 'directory') {
      for (const childId of node.children) {
        this.relocateChildPath(this.mustGetById(childId), oldBasePath, newBasePath)
      }
    }
    this.updateNode(node)
  }

  private cloneNodeRecursive(
    source: VfsNodeSnapshot,
    targetParent: VfsDirectoryNodeSnapshot,
    targetName: string,
  ): VfsNodeSnapshot {
    if (source.type === 'file') {
      const clone: VfsFileNodeSnapshot = {
        ...source,
        id: this.nextId(),
        parentId: targetParent.id,
        name: targetName,
        path: joinPath(targetParent.path, targetName),
        mtime: Date.now(),
      }
      targetParent.children.push(clone.id)
      this.updateNode(targetParent)
      this.addNode(clone)
      return clone
    }

    const directoryClone: VfsDirectoryNodeSnapshot = {
      ...source,
      id: this.nextId(),
      parentId: targetParent.id,
      name: targetName,
      path: joinPath(targetParent.path, targetName),
      mtime: Date.now(),
      children: [],
    }
    targetParent.children.push(directoryClone.id)
    this.updateNode(targetParent)
    this.addNode(directoryClone)

    for (const childId of source.children) {
      const child = this.mustGetById(childId)
      this.cloneNodeRecursive(child, directoryClone, child.name)
    }
    this.updateNode(directoryClone)
    return directoryClone
  }

  private createDirectory(path: string): VfsDirectoryNodeSnapshot {
    const parentPath = dirname(path)
    const parent = this.mustGetDirectory(parentPath)
    const node: VfsDirectoryNodeSnapshot = {
      id: this.nextId(),
      type: 'directory',
      path,
      name: basename(path),
      parentId: parent.id,
      children: [],
      mtime: Date.now(),
    }
    parent.children.push(node.id)
    parent.mtime = Date.now()
    this.updateNode(parent)
    this.addNode(node)
    return node
  }

  private toStat(node: VfsNodeSnapshot): VfsStat {
    return {
      path: node.path,
      name: node.name,
      type: node.type,
      size: node.type === 'file' ? node.size : node.children.length,
      mtime: node.mtime,
    }
  }

  private removeNode(node: VfsNodeSnapshot): void {
    if (node.parentId) {
      const parent = this.mustGetById(node.parentId)
      if (parent.type !== 'directory') throw new VfsNotDirectoryError(`Invalid parent for ${node.path}`)
      parent.children = parent.children.filter((id) => id !== node.id)
      parent.mtime = Date.now()
      this.updateNode(parent)
    }
    this.nodes.delete(node.id)
    this.pathIndex.delete(node.path)
  }

  private addNode(node: VfsNodeSnapshot): void {
    this.nodes.set(node.id, node)
    this.pathIndex.set(node.path, node.id)
  }

  private updateNode(node: VfsNodeSnapshot): void {
    this.nodes.set(node.id, node)
    this.pathIndex.set(node.path, node.id)
  }

  private reindexPath(oldPath: string, node: VfsNodeSnapshot): void {
    this.pathIndex.delete(oldPath)
    this.pathIndex.set(node.path, node.id)
  }

  private mustGetByPath(path: string): VfsNodeSnapshot {
    const id = this.pathIndex.get(path)
    if (!id) throw new VfsNotFoundError(`Path not found: ${path}`)
    return this.mustGetById(id)
  }

  private mustGetById(id: string): VfsNodeSnapshot {
    const node = this.nodes.get(id)
    if (!node) throw new VfsNotFoundError(`Node not found: ${id}`)
    return node
  }

  private mustGetDirectory(path: string): VfsDirectoryNodeSnapshot {
    const node = this.mustGetByPath(normalizePath(path))
    if (node.type !== 'directory') throw new VfsNotDirectoryError(`Not a directory: ${path}`)
    return node
  }

  private mustGetFile(path: string): VfsFileNodeSnapshot {
    const node = this.mustGetByPath(normalizePath(path))
    if (node.type !== 'file') throw new VfsIsDirectoryError(`Path is a directory: ${path}`)
    return node
  }

  private nextId(): string {
    this.idSeed += 1
    return `node-${this.idSeed}`
  }

  private recomputeIdSeed(): void {
    let maxSeed = 1
    for (const id of this.nodes.keys()) {
      const matched = /^node-(\d+)$/.exec(id)
      if (!matched) continue
      const value = Number.parseInt(matched[1], 10)
      if (!Number.isNaN(value)) {
        maxSeed = Math.max(maxSeed, value)
      }
    }
    this.idSeed = maxSeed
  }
}
