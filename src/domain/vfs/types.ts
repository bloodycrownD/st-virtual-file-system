export type VfsNodeType = 'file' | 'directory'

export interface VfsStat {
  path: string
  name: string
  type: VfsNodeType
  size: number
  mtime: number
}

export interface VfsListItem extends VfsStat {}

export interface VfsWriteOptions {
  createParents?: boolean
}

export interface VfsDeleteOptions {
  recursive?: boolean
}

export interface VfsFileContentSnapshot {
  encoding: 'plain' | 'deflate-base64'
  data: string
  originalSize: number
  compressedSize?: number
}

interface VfsNodeSnapshotBase {
  id: string
  path: string
  name: string
  parentId: string | null
  type: VfsNodeType
  mtime: number
}

export interface VfsDirectoryNodeSnapshot extends VfsNodeSnapshotBase {
  type: 'directory'
  children: string[]
}

export interface VfsFileNodeSnapshot extends VfsNodeSnapshotBase {
  type: 'file'
  size: number
  content: VfsFileContentSnapshot
}

export type VfsNodeSnapshot = VfsDirectoryNodeSnapshot | VfsFileNodeSnapshot

export interface VfsSnapshot {
  schemaVersion: 1
  rootId: string
  nodes: Record<string, VfsNodeSnapshot>
}
