import createDOMPurify, { type WindowLike } from 'dompurify'

const BLOCKED_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'form'])

const ALLOWED_TAGS = [
  'a',
  'abbr',
  'b',
  'blockquote',
  'br',
  'code',
  'del',
  'details',
  'div',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'img',
  'kbd',
  'li',
  'ol',
  'p',
  'pre',
  's',
  'span',
  'strong',
  'sub',
  'summary',
  'sup',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'ul',
]

const ALLOWED_ATTR = [
  'alt',
  'aria-label',
  'class',
  'colspan',
  'data-language',
  'href',
  'id',
  'rel',
  'rowspan',
  'src',
  'target',
  'title',
]

let purify: ReturnType<typeof createDOMPurify> | null = null
let hookInstalled = false

function getPurify(): ReturnType<typeof createDOMPurify> {
  if (purify) return purify
  const w = window as unknown as WindowLike
  purify = createDOMPurify(w as unknown as WindowLike)
  return purify
}

function ensureHooksInstalled(): void {
  if (hookInstalled) return
  hookInstalled = true

  const p = getPurify()
  p.addHook('uponSanitizeAttribute', (_node, data) => {
    const attr = (data.attrName || '').toLowerCase()
    if (attr.startsWith('on') || attr === 'style') {
      data.keepAttr = false
      return
    }

    if (attr !== 'href' && attr !== 'src') return
    const value = String(data.attrValue ?? '').trim()
    const lower = value.toLowerCase()
    if (lower.startsWith('javascript:') || lower.startsWith('vbscript:') || lower.startsWith('data:text/html')) {
      data.attrValue = '#'
      return
    }

    if (attr === 'src' && lower.startsWith('data:')) {
      const ok = /^data:image\/(?:png|gif|jpe?g|webp);/i.test(value)
      if (!ok) data.attrValue = '#'
    }
  })
}

export function sanitizeLoose(inputHtml: string): string {
  // WHY: a single, shared sanitize boundary prevents divergent escaping across Reader/Preview.
  ensureHooksInstalled()
  return getPurify().sanitize(inputHtml, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORBID_TAGS: Array.from(BLOCKED_TAGS),
    FORBID_ATTR: ['style'],
  })
}

export function isBlockedTag(tagName: string): boolean {
  return BLOCKED_TAGS.has(tagName.toLowerCase())
}
