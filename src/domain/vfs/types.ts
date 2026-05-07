/**
 * Virtual File System (VFS) domain types.
 *
 * Responsibilities:
 * - Define the public data shapes used by the in-memory VFS (`VfsCore`) and its
 *   persistence layer (snapshots).
 * - Keep types stable and serializable so snapshots can be validated and moved
 *   across boundaries (storage, transport, tests).
 *
 * Key invariants (enforced by higher-level logic / snapshot validation):
 * - `path` values are normalized absolute paths (see `normalizePath`) and are
 *   unique across all nodes in a snapshot.
 * - The root node has `path === "/"`, `name === ""`, and `parentId === null`.
 * - For files, `size` reflects the decoded (original) content length that VFS
 *   APIs expose, even if the snapshot stores compressed content.
 */
export type VfsNodeType = 'file' | 'directory'

/**
 * Lightweight stat information returned by VFS queries.
 *
 * Notes:
 * - `size` is interpreted as:
 *   - **files**: decoded content size (in characters, matching `writeFile`)
 *   - **directories**: number of direct children
 */
export interface VfsStat {
  path: string
  name: string
  type: VfsNodeType
  size: number
  mtime: number
}

/** List entries have the same shape as `VfsStat` (kept as an alias for clarity). */
export interface VfsListItem extends VfsStat {}

/**
 * Options for `writeFile`.
 * - `createParents`: if true, missing parent directories are created.
 */
export interface VfsWriteOptions {
  createParents?: boolean
}

/**
 * Options for `delete`.
 * - `recursive`: if true, non-empty directories are deleted recursively.
 */
export interface VfsDeleteOptions {
  recursive?: boolean
}

/**
 * Serialized file content stored in snapshots.
 *
 * Notes:
 * - `encoding` describes how `data` should be interpreted.
 * - `originalSize` is the decoded size, which is used by validation and can be
 *   helpful for sanity checks when `encoding` is compressed.
 * - `compressedSize` is optional metadata (useful for diagnostics) and is not
 *   required for correctness.
 */
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

/**
 * Snapshot representation of a file node.
 *
 * Important: `size` matches the decoded/plaintext length visible to callers,
 * not the byte length of any encoded/compressed representation.
 */
export interface VfsFileNodeSnapshot extends VfsNodeSnapshotBase {
  type: 'file'
  size: number
  content: VfsFileContentSnapshot
}

/** Discriminated union of supported node snapshots. */
export type VfsNodeSnapshot = VfsDirectoryNodeSnapshot | VfsFileNodeSnapshot

/**
 * A complete, serializable representation of the VFS state.
 *
 * Notes:
 * - `schemaVersion` is pinned to `1` for now; future versions can evolve while
 *   keeping validation strict.
 * - `rootId` names the root directory node key inside `nodes`.
 * - `nodes` is a map keyed by node id; ids must match the `id` field of each node.
 */
export interface VfsSnapshot {
  schemaVersion: 1
  rootId: string
  nodes: Record<string, VfsNodeSnapshot>
}
