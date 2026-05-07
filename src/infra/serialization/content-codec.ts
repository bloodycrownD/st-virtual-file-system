import type { VfsFileContentSnapshot } from '@/domain/vfs/types'

export interface ContentCodec {
  encode(text: string): VfsFileContentSnapshot
  decode(content: VfsFileContentSnapshot): string
}
