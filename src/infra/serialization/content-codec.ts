import type { VfsFileContentSnapshot } from '@/domain/vfs/types'

/**
 * @file Content encoding boundary for snapshots.
 *
 * `ContentCodec` defines how file text is represented inside a `VfsFileContentSnapshot`.
 * Implementations must keep the representation JSON-friendly because snapshots are persisted as
 * JSON (e.g., plain text vs compressed+base64).
 */
export interface ContentCodec {
  /** Encode a UTF-8 string into a snapshot-friendly representation. */
  encode(text: string): VfsFileContentSnapshot
  /** Decode snapshot content back into a UTF-8 string. */
  decode(content: VfsFileContentSnapshot): string
}
