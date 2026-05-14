import { VFS_ERROR_CODES } from '@/app/constants/vfsErrorCodes'
import { sanitizeLoose } from '@/app/services/vfs/sanitizeConfig'
import {
  escapeHtml,
  parseFrontMatterKeyValueRows,
  splitYamlFrontMatter,
} from '@/domain/markdown/markdown-frontmatter'
import { marked } from 'marked'

export interface RenderResult {
  ok: boolean
  html?: string
  errorCode?: string
  message?: string
}

function formatEscapedValueLines(escaped: string): string {
  if (!escaped) return ''
  return escaped.replace(/\n/g, '<br>')
}

function buildFrontMatterBlockHtml(frontMatterText: string): string {
  const rows = parseFrontMatterKeyValueRows(frontMatterText)
  if (rows.length === 0) {
    return '<div class="vfs-md-frontmatter vfs-md-frontmatter--empty"></div>'
  }
  const rowHtml = rows
    .map(({ key, value }) => {
      const keyHtml = escapeHtml(key)
      const valEscaped = escapeHtml(value)
      const long = value.length > 160 || value.includes('\n')
      const valueHtml = long
        ? `<details class="vfs-md-frontmatter__details"><summary class="vfs-md-frontmatter__summary">${escapeHtml('展开')}</summary><div class="vfs-md-frontmatter__value vfs-md-frontmatter__value--block">${formatEscapedValueLines(valEscaped)}</div></details>`
        : `<span class="vfs-md-frontmatter__value">${valEscaped}</span>`
      return `<div class="vfs-md-frontmatter__row"><span class="vfs-md-frontmatter__key">${keyHtml}</span>${valueHtml}</div>`
    })
    .join('')
  return `<div class="vfs-md-frontmatter">${rowHtml}</div>`
}

/**
 * Renders Markdown with optional YAML front matter: FM is escaped HTML in a
 * dedicated container; body uses `marked` + `sanitizeLoose` (same as legacy reader path).
 */
export function renderSafeMarkdownDocument(raw: string): RenderResult {
  try {
    const { frontMatterText, body } = splitYamlFrontMatter(raw ?? '')
    const fmHtml = frontMatterText !== null ? buildFrontMatterBlockHtml(frontMatterText) : ''
    const rendered = marked.parse(body, {
      gfm: true,
      breaks: true,
    })
    const bodyHtml = sanitizeLoose(String(rendered))
    const combined = fmHtml ? `${fmHtml}${bodyHtml}` : bodyHtml
    return {
      ok: true,
      html: sanitizeLoose(combined),
    }
  } catch {
    return {
      ok: false,
      errorCode: VFS_ERROR_CODES.RENDER_FAILED,
      message: 'Render pipeline failed',
    }
  }
}

export function renderSafeContent(raw: string): RenderResult {
  return renderSafeMarkdownDocument(raw)
}
