import { VFS_ERROR_CODES } from '@/app/constants/vfsErrorCodes'
import { sanitizeLoose } from '@/app/services/vfs/sanitizeConfig'

export interface RenderResult {
  ok: boolean
  html?: string
  errorCode?: string
  message?: string
}

export function renderSafeContent(raw: string): RenderResult {
  try {
    return {
      ok: true,
      html: sanitizeLoose(raw),
    }
  } catch {
    return {
      ok: false,
      errorCode: VFS_ERROR_CODES.RENDER_FAILED,
      message: 'Render pipeline failed',
    }
  }
}
