import { VFS_ERROR_CODES } from '@/app/constants/vfsErrorCodes'
import { sanitizeLoose } from '@/app/services/vfs/sanitizeConfig'
import { marked } from 'marked'

export interface RenderResult {
  ok: boolean
  html?: string
  errorCode?: string
  message?: string
}

export function renderSafeContent(raw: string): RenderResult {
  try {
    const rendered = marked.parse(raw ?? '', {
      gfm: true,
      breaks: true,
    })
    return {
      ok: true,
      html: sanitizeLoose(String(rendered)),
    }
  } catch {
    return {
      ok: false,
      errorCode: VFS_ERROR_CODES.RENDER_FAILED,
      message: 'Render pipeline failed',
    }
  }
}
