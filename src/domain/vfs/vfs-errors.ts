/**
 * Virtual File System (VFS) domain errors.
 *
 * Responsibilities:
 * - Provide a small, typed error hierarchy for VFS operations.
 * - Keep error classes lightweight so they are cheap to construct and easy to
 *   pattern-match with `instanceof` in callers.
 *
 * Design notes:
 * - These classes intentionally do not add extra fields beyond `Error` so that
 *   serialization/logging and cross-module usage remain straightforward.
 * - Messages are supplied by throwing sites (they have the most context).
 */
export class VfsError extends Error {}

/** Thrown when a referenced path or node id does not exist. */
export class VfsNotFoundError extends VfsError {}

/** Thrown when an operation requires a path to be absent, but it already exists. */
export class VfsAlreadyExistsError extends VfsError {}

/** Thrown when a path is malformed, unsafe, or violates VFS invariants. */
export class VfsInvalidPathError extends VfsError {}

/** Thrown when an operation expects a directory but finds a non-directory. */
export class VfsNotDirectoryError extends VfsError {}

/** Thrown when an operation expects a file but finds a directory. */
export class VfsIsDirectoryError extends VfsError {}
