/**
 * YAML-style front matter fence detection aligned with
 * `frontMatterDisplayLines` in `work-tree-engine.ts` (first line trim `---`,
 * next closing line trim `---`; no closing ⇒ no front matter).
 */

export interface SplitYamlFrontMatterResult {
  /** Inner YAML text between opening and closing fences (no `---` lines). Null when no valid fence pair. */
  frontMatterText: string | null
  /** Markdown body after the closing fence; entire `raw` when front matter is absent. */
  body: string
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Fence split only — same hit/miss rules as work-tree `frontMatterDisplayLines`.
 */
export function splitYamlFrontMatter(raw: string): SplitYamlFrontMatterResult {
  const lines = raw.split('\n')
  if (lines[0]?.trim() !== '---') {
    return { frontMatterText: null, body: raw }
  }
  let end = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === '---') {
      end = i
      break
    }
  }
  if (end < 0) {
    return { frontMatterText: null, body: raw }
  }
  const inner = lines.slice(1, end).join('\n')
  const body = lines.slice(end + 1).join('\n')
  return { frontMatterText: inner, body }
}

export interface FrontMatterKeyValueRow {
  key: string
  value: string
}

const KEY_VALUE_LINE = /^\s*([^:\n]+?)\s*:\s*(.*)$/

/**
 * Heuristic key/value rows for display only (not a YAML parser).
 * Non-matching lines append to the previous value with a leading newline.
 */
export function parseFrontMatterKeyValueRows(frontMatterText: string): FrontMatterKeyValueRow[] {
  const lines = frontMatterText.split('\n')
  const rows: FrontMatterKeyValueRow[] = []
  for (const line of lines) {
    const match = line.match(KEY_VALUE_LINE)
    if (match) {
      rows.push({ key: match[1] ?? '', value: match[2] ?? '' })
      continue
    }
    if (rows.length > 0) {
      const last = rows[rows.length - 1]!
      last.value += `\n${line}`
    }
  }
  return rows
}
