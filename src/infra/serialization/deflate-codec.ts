import { strToU8, strFromU8, zlibSync, unzlibSync } from 'fflate'
import type { VfsFileContentSnapshot } from '@/domain/vfs/types'
import type { ContentCodec } from './content-codec'

export interface DeflateCodecOptions {
  /** 小于阈值的文本不压缩，避免“压缩后反而更大”的情况。 */
  threshold?: number
}

/** Uint8Array -> base64：用于把二进制压缩结果放进 JSON 字符串字段。 */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  if (typeof globalThis.btoa !== 'function') {
    throw new Error('btoa is not available in current runtime')
  }
  return globalThis.btoa(binary)
}

/** base64 -> Uint8Array：读取快照时把 JSON 字符串还原为字节流。 */
function base64ToBytes(base64: string): Uint8Array {
  if (typeof globalThis.atob !== 'function') {
    throw new Error('atob is not available in current runtime')
  }
  const binary = globalThis.atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export class DeflateContentCodec implements ContentCodec {
  private readonly threshold: number

  constructor(options: DeflateCodecOptions = {}) {
    // 默认阈值偏保守：优先可读性和低开销，再按需要调大/调小。
    this.threshold = options.threshold ?? 256
  }

  encode(text: string): VfsFileContentSnapshot {
    const source = strToU8(text)
    if (source.length < this.threshold) {
      // 小文本直接明文存储：可读、可调试、避免压缩/编码额外成本。
      return {
        encoding: 'plain',
        data: text,
        originalSize: source.length,
      }
    }

    const compressed = zlibSync(source)
    return {
      encoding: 'deflate-base64',
      data: bytesToBase64(compressed),
      originalSize: source.length,
      compressedSize: compressed.length,
    }
  }

  decode(content: VfsFileContentSnapshot): string {
    if (content.encoding === 'plain') {
      return content.data
    }
    // deflate-base64：先还原字节，再解压并按 UTF-8 转回字符串。
    const compressed = base64ToBytes(content.data)
    return strFromU8(unzlibSync(compressed))
  }
}
