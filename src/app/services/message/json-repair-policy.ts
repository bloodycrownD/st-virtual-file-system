/**
 * @module json-repair-policy
 *
 * Conservative pre-check before attempting automatic JSON repair on virtual tool-call payloads.
 *
 * Only **high-confidence structural** defects (missing closers, trailing commas) should proceed to
 * `jsonrepair`. Low-confidence cases—especially unterminated string literals in large text args—are
 * rejected so the message channel keeps the `<virtual-tool-call>` block for manual edit/retry.
 */
/** Stable reason codes for logs, tests, and observability. */
export type JsonRepairReasonCode = 'UNTERMINATED_STRING' | 'LIKELY_TRUNCATED_PAYLOAD' | 'INDETERMINATE_STRUCTURE'

const PAYLOAD_STRING_KEYS = new Set(['content', 'oldContent', 'newContent'])

export interface RepairabilityAssessment {
  allowed: boolean
  reasonCode?: JsonRepairReasonCode
}

/**
 * Determines whether automatic repair may be attempted for malformed call JSON.
 *
 * @param raw - Trimmed inner content of `<virtual-tool-call>` (expected JSON object).
 */
export function assessRepairability(raw: string): RepairabilityAssessment {
  const scan = scanJson(raw)
  if (scan.inString) {
    if (scan.valueKey && PAYLOAD_STRING_KEYS.has(scan.valueKey)) {
      return { allowed: false, reasonCode: 'LIKELY_TRUNCATED_PAYLOAD' }
    }
    return { allowed: false, reasonCode: 'UNTERMINATED_STRING' }
  }
  const trimmed = raw.trimEnd()
  if (trimmed.length === 0) {
    return { allowed: false, reasonCode: 'INDETERMINATE_STRUCTURE' }
  }
  const last = trimmed[trimmed.length - 1]
  if (last === ':' || last === ',') {
    return { allowed: false, reasonCode: 'LIKELY_TRUNCATED_PAYLOAD' }
  }
  if (last === '"' && scan.bracketStack.length === 0) {
    return { allowed: false, reasonCode: 'LIKELY_TRUNCATED_PAYLOAD' }
  }
  return { allowed: true }
}

interface JsonScanResult {
  inString: boolean
  valueKey: string | null
  bracketStack: Array<'{' | '['>
}

function scanJson(raw: string): JsonScanResult {
  const bracketStack: Array<'{' | '['> = []
  let inString = false
  let escape = false
  let valueKey: string | null = null
  let i = 0
  while (i < raw.length) {
    const ch = raw[i]
    if (inString) {
      if (escape) {
        escape = false
        i++
        continue
      }
      if (ch === '\\') {
        escape = true
        i++
        continue
      }
      if (ch === '"') {
        inString = false
        i++
        continue
      }
      i++
      continue
    }
    if (ch === '"') {
      const parsed = readQuotedToken(raw, i)
      if (parsed.closed) {
        if (isKeyAt(raw, parsed.endIndex)) {
          valueKey = null
        } else if (isValueAt(raw, i)) {
          valueKey = findEnclosingKey(raw, i)
        }
        i = parsed.endIndex
        continue
      }
      if (isValueAt(raw, i)) {
        valueKey = findEnclosingKey(raw, i)
      }
      return { inString: true, valueKey, bracketStack }
    }
    if (ch === '{') {
      bracketStack.push('{')
      valueKey = null
    } else if (ch === '[') {
      bracketStack.push('[')
    } else if (ch === '}') {
      popBracket(bracketStack, '{')
    } else if (ch === ']') {
      popBracket(bracketStack, '[')
    } else if (ch === ',') {
      valueKey = null
    }
    i++
  }
  return { inString: false, valueKey, bracketStack }
}

function readQuotedToken(raw: string, start: number): { closed: boolean; endIndex: number } {
  let escape = false
  for (let i = start + 1; i < raw.length; i++) {
    const ch = raw[i]
    if (escape) {
      escape = false
      continue
    }
    if (ch === '\\') {
      escape = true
      continue
    }
    if (ch === '"') {
      return { closed: true, endIndex: i + 1 }
    }
  }
  return { closed: false, endIndex: raw.length }
}

function isKeyAt(raw: string, from: number): boolean {
  for (let i = from; i < raw.length; i++) {
    const ch = raw[i]
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') continue
    return ch === ':'
  }
  return false
}

function isValueAt(raw: string, quoteIndex: number): boolean {
  for (let i = quoteIndex - 1; i >= 0; i--) {
    const ch = raw[i]
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') continue
    return ch === ':'
  }
  return false
}

function findEnclosingKey(raw: string, valueQuoteIndex: number): string | null {
  let objectDepth = 0
  for (let i = valueQuoteIndex - 1; i >= 0; i--) {
    const ch = raw[i]
    if (ch === '}') {
      objectDepth++
      continue
    }
    if (ch === '{') {
      if (objectDepth > 0) {
        objectDepth--
        continue
      }
      break
    }
    if (objectDepth === 0 && ch === '"') {
      const token = readQuotedToken(raw, i)
      if (token.closed && token.endIndex <= valueQuoteIndex && isKeyAt(raw, token.endIndex)) {
        return raw.slice(i + 1, token.endIndex - 1)
      }
    }
  }
  return null
}

function popBracket(stack: Array<'{' | '['>, expected: '{' | '['): void {
  if (stack[stack.length - 1] === expected) {
    stack.pop()
  }
}
