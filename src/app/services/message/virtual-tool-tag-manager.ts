const CALL_TAG_RE = /<virtual-tool-call>([\s\S]*?)<\/virtual-tool-call>/g
const RESULT_TAG_RE = /<virtual-tool-result>([\s\S]*?)<\/virtual-tool-result>/g

export interface VirtualToolCallBlock {
  content: string
  start: number
  end: number
}

export function extractLastCallBlock(message: string): VirtualToolCallBlock | null {
  let match: RegExpExecArray | null = null
  let last: RegExpExecArray | null = null
  while ((match = CALL_TAG_RE.exec(message)) !== null) {
    last = match
  }
  if (!last) return null
  return {
    content: last[1].trim(),
    start: last.index,
    end: last.index + last[0].length,
  }
}

export function validateSingleResultTag(message: string): { ok: boolean; count: number } {
  const count = [...message.matchAll(RESULT_TAG_RE)].length
  return { ok: count <= 1, count }
}

export function replaceCallWithResult(message: string, callBlock: VirtualToolCallBlock, result: unknown): string {
  const payload = JSON.stringify(result)
  return `${message.slice(0, callBlock.start)}<virtual-tool-result>${payload}</virtual-tool-result>${message.slice(callBlock.end)}`
}
