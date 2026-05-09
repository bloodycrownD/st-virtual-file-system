import { VFS_ERROR_CODES, type VfsErrorCode } from '@/app/constants/vfsErrorCodes'
import {
  VfsAlreadyExistsError,
  VfsInvalidPathError,
  VfsIsDirectoryError,
  VfsNotDirectoryError,
  VfsNotFoundError,
} from '@/domain/vfs/vfs-errors'

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

export function mapVfsMutationError(error: unknown, fallbackCode: VfsErrorCode): { code: VfsErrorCode; message: string } {
  const fallbackMessage = error instanceof Error ? error.message : String(error)
  if (error instanceof VfsAlreadyExistsError) {
    return { code: VFS_ERROR_CODES.RENAME_FAILED, message: fallbackMessage || 'Path already exists' }
  }
  if (error instanceof VfsInvalidPathError) {
    return { code: VFS_ERROR_CODES.SAVE_FAILED, message: fallbackMessage || 'Invalid path' }
  }
  if (error instanceof VfsNotFoundError) {
    return { code: VFS_ERROR_CODES.SAVE_FAILED, message: fallbackMessage || 'Path not found' }
  }
  if (error instanceof VfsNotDirectoryError || error instanceof VfsIsDirectoryError) {
    return { code: VFS_ERROR_CODES.SAVE_FAILED, message: fallbackMessage || 'Path type mismatch' }
  }
  return {
    code: fallbackCode,
    message: fallbackMessage || FALLBACK_ERROR_MESSAGE,
  }
}
