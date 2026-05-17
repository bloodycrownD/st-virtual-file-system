const TEXT_LAYOUT_PROPS = [
  'font',
  'fontSize',
  'fontFamily',
  'fontWeight',
  'fontStyle',
  'lineHeight',
  'letterSpacing',
  'wordSpacing',
  'whiteSpace',
  'overflowWrap',
  'wordBreak',
  'tabSize',
] as const

/** Width of the textarea text column (inside horizontal padding). */
export function getTextareaContentWidth(textarea: HTMLTextAreaElement): number {
  const style = getComputedStyle(textarea)
  const paddingLeft = Number.parseFloat(style.paddingLeft) || 0
  const paddingRight = Number.parseFloat(style.paddingRight) || 0
  const subtractPadding = (width: number) => Math.max(0, width - paddingLeft - paddingRight)

  if (textarea.clientWidth > 0) return subtractPadding(textarea.clientWidth)

  const parsedWidth = Number.parseFloat(style.width)
  if (Number.isFinite(parsedWidth) && parsedWidth > 0) return subtractPadding(parsedWidth)

  if (textarea.offsetWidth > 0) return subtractPadding(textarea.offsetWidth)

  return 0
}

export function measureVisualRowHeightPx(textarea: HTMLTextAreaElement): number {
  const style = getComputedStyle(textarea)
  if (style.lineHeight.endsWith('px')) {
    const parsed = Number.parseFloat(style.lineHeight)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }

  const probe = document.createElement('div')
  probe.textContent = 'X'
  probe.style.cssText = [
    'position:absolute',
    'visibility:hidden',
    'white-space:pre',
    'padding:0',
    'border:0',
    `font:${style.font}`,
    `font-size:${style.fontSize}`,
    `line-height:${style.lineHeight}`,
    `font-family:${style.fontFamily}`,
  ].join(';')
  document.body.appendChild(probe)
  const height = probe.offsetHeight
  document.body.removeChild(probe)
  return height > 0 ? height : 21
}

/** Apply textarea typography + content width so mirror lines soft-wrap like the textarea. */
export function syncEditorMirrorLayout(textarea: HTMLTextAreaElement, mirror: HTMLElement): number {
  const style = getComputedStyle(textarea)
  const contentWidth = getTextareaContentWidth(textarea)

  mirror.style.boxSizing = 'content-box'
  mirror.style.width = `${contentWidth}px`
  mirror.style.maxWidth = `${contentWidth}px`
  mirror.style.minWidth = '0'
  mirror.style.padding = '0'
  mirror.style.margin = '0'
  mirror.style.border = '0'

  for (const prop of TEXT_LAYOUT_PROPS) {
    mirror.style[prop] = style[prop]
  }

  // Force layout with the new width before callers read line heights.
  void mirror.offsetWidth
  return contentWidth
}

const MIRROR_UNDERCOUNT_MIN_CHARS = 48

function applyTextLayoutStyles(el: HTMLElement, style: CSSStyleDeclaration): void {
  for (const prop of TEXT_LAYOUT_PROPS) {
    el.style[prop] = style[prop]
  }
}

/** Hidden probe when mirror width was not ready and reported a single visual row for a long line. */
function countVisualRowsWithDomProbe(
  line: string,
  contentWidthPx: number,
  style: CSSStyleDeclaration,
  rowHeightPx: number,
): number {
  const el = document.createElement('div')
  el.textContent = line
  el.style.position = 'absolute'
  el.style.visibility = 'hidden'
  el.style.left = '-100000px'
  el.style.top = '0'
  el.style.width = `${contentWidthPx}px`
  el.style.boxSizing = 'content-box'
  el.style.padding = '0'
  el.style.margin = '0'
  el.style.border = '0'
  applyTextLayoutStyles(el, style)
  document.body.appendChild(el)
  void el.offsetWidth
  const height = el.getBoundingClientRect().height
  document.body.removeChild(el)
  return Math.max(1, Math.ceil(height / rowHeightPx))
}

export function resolveEditorVisualRowCounts(options: {
  textarea: HTMLTextAreaElement
  mirror: HTMLElement
  lines: string[]
  rowHeightPx: number
  contentWidthPx: number
}): number[] {
  const style = getComputedStyle(options.textarea)
  const lineNodes = options.mirror.querySelectorAll<HTMLElement>('.vfs-editor-line-mirror__line')

  if (options.lines.length === 0) return [1]

  return options.lines.map((line, index) => {
    const mirrorNode = lineNodes[index]
    const mirrorCount = mirrorNode
      ? Math.max(1, Math.ceil(mirrorNode.getBoundingClientRect().height / options.rowHeightPx))
      : 1
    if (
      mirrorCount === 1 &&
      line.length >= MIRROR_UNDERCOUNT_MIN_CHARS &&
      options.contentWidthPx > 0
    ) {
      return countVisualRowsWithDomProbe(line, options.contentWidthPx, style, options.rowHeightPx)
    }
    return mirrorCount
  })
}
