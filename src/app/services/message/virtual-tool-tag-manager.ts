/**
 * @module virtual-tool-tag-manager
 *
 * Utilities for working with **virtual tool tags** embedded in a single SillyTavern message.
 *
 * ## Tag semantics (contract)
 *
 * - **Call tag**: `<virtual-tool-call> ... </virtual-tool-call>`
 *   - The inner content is expected to be a JSON string representing a tool-call envelope.
 *   - **Only the last call tag is actionable**. If multiple call tags exist, earlier ones are treated as history
 *     and are ignored for execution. This is intentional to match the spec and to let the model “revise”
 *     a tool request by appending a later call.
 *
 * - **Result tag**: `<virtual-tool-result> ... </virtual-tool-result>`
 *   - The inner content is always written as a JSON string (see `replaceCallWithResult`).
 *   - A message is expected to contain **at most one** result tag.
 *   - If multiple result tags exist, the message is considered in an inconsistent state and the caller should
 *     **refuse to execute** (to avoid ambiguous “which result is authoritative” scenarios).
 *
 * ## Atomic replacement
 *
 * `replaceCallWithResult` performs an **atomic textual replace** of one call-tag block with one result-tag
 * block by slicing the original message. This provides a simple idempotency mechanism: once a call is replaced
 * by a result, subsequent passes should see “no call to execute”.
 *
 * Note: This module is intentionally pure/string-based; it does not interpret tool payloads beyond trimming
 * and counting tags.
 */
const CALL_TAG_RE = /<virtual-tool-call>([\s\S]*?)<\/virtual-tool-call>/g
const RESULT_TAG_RE = /<virtual-tool-result>([\s\S]*?)<\/virtual-tool-result>/g

export interface VirtualToolCallBlock {
  content: string
  start: number
  end: number
}

/**
 * Extracts the **last** `<virtual-tool-call>...</virtual-tool-call>` block from `message`.
 *
 * - **Last-call wins**: earlier call blocks (if any) are ignored.
 * - The returned `content` is trimmed to reduce sensitivity to model-added indentation/newlines.
 *
 * @param message - Full message text to scan.
 * @returns The last call block with its content and byte offsets, or `null` if no call tag exists.
 */
export function extractLastCallBlock(message: string): VirtualToolCallBlock | null {
  let match: RegExpExecArray | null = null
  let last: RegExpExecArray | null = null
  while ((match = CALL_TAG_RE.exec(message)) !== null) {
    last = match
  }
  if (!last) return null
  return {
    // 去掉包裹空白，降低模型输出换行/缩进对解析的影响。
    content: last[1].trim(),
    start: last.index,
    end: last.index + last[0].length,
  }
}

/**
 * Validates that the message contains **at most one** `<virtual-tool-result>` tag.
 *
 * This is used as a consistency guard. If multiple result tags exist, the caller should treat the message as
 * invalid/ambiguous and avoid executing any call tags until the inconsistency is resolved.
 *
 * @param message - Full message text to scan.
 * @returns `ok=false` when more than one result tag is present, along with the observed count.
 */
export function validateSingleResultTag(message: string): { ok: boolean; count: number } {
  const count = [...message.matchAll(RESULT_TAG_RE)].length
  return { ok: count <= 1, count }
}

/**
 * Replaces a specific call-tag block with a result-tag block.
 *
 * - **Atomic (textual) replace**: uses the `start`/`end` offsets from `callBlock` to splice the message.
 * - **Canonical JSON**: the result payload is always serialized via `JSON.stringify`, so consumers only need
 *   to parse one format.
 *
 * @param message - Original message text.
 * @param callBlock - The call block (and offsets) to replace, typically from `extractLastCallBlock`.
 * @param result - Arbitrary result object to embed as JSON.
 * @returns Updated message text where the call tag is replaced with a single result tag.
 */
export function replaceCallWithResult(message: string, callBlock: VirtualToolCallBlock, result: unknown): string {
  // result 固定写成 JSON 字符串，后续消费方只需 parse 一种格式。
  const payload = JSON.stringify(result)
  return `${message.slice(0, callBlock.start)}<virtual-tool-result>${payload}</virtual-tool-result>${message.slice(callBlock.end)}`
}
