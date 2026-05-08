import { VFS_ERROR_CODES, type VfsErrorCode } from '@/app/constants/vfsErrorCodes'

const FALLBACK_ERROR_MESSAGE = 'Unexpected VFS error'

export function toVfsErrorToast(errorCode: string | undefined, message: string | undefined): string {
  // WHY: keeping a strict `[code] message` shape makes ops filtering deterministic.
  const normalizedCode: VfsErrorCode =
    Object.values(VFS_ERROR_CODES).includes((errorCode ?? '') as VfsErrorCode)
      ? (errorCode as VfsErrorCode)
      : VFS_ERROR_CODES.UNKNOWN
  const normalizedMessage = message?.trim() || FALLBACK_ERROR_MESSAGE
  return `[${normalizedCode}] ${normalizedMessage}`
}
