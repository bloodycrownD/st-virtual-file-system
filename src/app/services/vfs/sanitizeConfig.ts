const BLOCKED_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'form'])

export function sanitizeLoose(input: string): string {
  // WHY: removing inline handlers/protocols at one boundary prevents inconsistent escaping in UI callers.
  return input
    .replace(/<\s*\/?\s*(script|style|iframe|object|embed|form)[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
    .replace(/(href|src)\s*=\s*(['"])\s*javascript:[^'"]*\2/gi, '$1=$2#$2')
}

export function isBlockedTag(tagName: string): boolean {
  return BLOCKED_TAGS.has(tagName.toLowerCase())
}
