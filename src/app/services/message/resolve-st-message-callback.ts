/**
 * @module resolve-st-message-callback
 *
 * Normalizes SillyTavern `eventSource` callback `args` into a `{ messageIndex, record }` pair for the
 * virtual-tool message pipeline.
 *
 * ## Why this exists
 *
 * ST is inconsistent across versions/locations: some paths pass a **numeric chat index** as `args[0]`,
 * others pass a **stringified index**, and others pass the **message object itself** (not `===` the array
 * element yet, or never the same reference). The old pipeline assumed `typeof args[0] === 'number'`
 * only — that yields `messageIndex: -1`, skips text resolution, and looks like "virtual tools never run
 * until reload".
 *
 * ## What we do not attempt
 *
 * - We do not guess arbitrary nested payloads beyond scanning `args` for the first object carrying `mes`
 *   or `message` as a string.
 */

export interface ResolvedChatMessageTarget {
  /** `>= 0` when we matched an array slot in `context.chat`; `-1` when using an extracted message object only. */
  messageIndex: number
  /** Message record used for text resolution + in-place mutation after tool runs; may be an instance not in `chat`. */
  record: Record<string, unknown> | undefined
}

function parseNonNegativeInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const n = Number.parseInt(value.trim(), 10)
    return Number.isFinite(n) && n >= 0 ? n : null
  }
  return null
}

function isMessageLikeRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const o = value as Record<string, unknown>
  return typeof o.mes === 'string' || typeof o.message === 'string'
}

function tryIndexThenRecord(args0: unknown, chat: Record<string, unknown>[]): ResolvedChatMessageTarget | null {
  const parsed = parseNonNegativeInt(args0)
  if (parsed !== null && parsed < chat.length) {
    return { messageIndex: parsed, record: chat[parsed] }
  }
  if (args0 && typeof args0 === 'object' && !Array.isArray(args0)) {
    const rec = args0 as Record<string, unknown>
    // WHY: some ST paths wrap `{ index, mes }` where `mes` is not the authoritative slot body; resolve slot first.
    const nested = parseNonNegativeInt(rec.index ?? rec.message_index ?? rec.messageIndex)
    if (nested !== null && nested < chat.length) {
      return { messageIndex: nested, record: chat[nested] }
    }
  }
  if (isMessageLikeRecord(args0)) {
    const rec = args0
    const i = chat.indexOf(rec)
    if (i >= 0) return { messageIndex: i, record: chat[i] }
    return { messageIndex: -1, record: rec }
  }
  return null
}

/** Best-effort summary for diagnostics (no message body contents). */
export function summarizeStMessageCallbackArgs0(value: unknown): string {
  if (value === undefined) return 'undefined'
  if (value === null) return 'null'
  const t = typeof value
  if (t === 'number' || t === 'boolean' || t === 'bigint') return `${t}:${String(value)}`
  if (t === 'string') {
    const s = value as string
    return `string(len=${s.length},numeric=${/^\d+$/.test(s.trim()) ? 'yes' : 'no'})`
  }
  if (Array.isArray(value)) return `array(len=${value.length})`
  if (t === 'object') {
    const keys = Object.keys(value as object).slice(0, 16)
    return `object(keys=${keys.join(',')})`
  }
  return t
}

/**
 * Resolve `messageIndex` + `record` from raw ST listener args.
 *
 * @param args - Raw callback arguments from `eventSource.on(...)`.
 * @param chat - Current `SillyTavern.getContext().chat` array (always an array when provided).
 */
export function resolveChatMessageTarget(args: unknown[], chat: Record<string, unknown>[]): ResolvedChatMessageTarget {
  if (args.length === 0) {
    return { messageIndex: -1, record: undefined }
  }

  const fromFirst = tryIndexThenRecord(args[0], chat)
  if (fromFirst) return fromFirst

  for (let i = 1; i < args.length; i += 1) {
    const v = args[i]
    if (!isMessageLikeRecord(v)) continue
    const rec = v
    const j = chat.indexOf(rec)
    if (j >= 0) return { messageIndex: j, record: chat[j] }
    return { messageIndex: -1, record: rec }
  }

  return { messageIndex: -1, record: undefined }
}

/** Stable string for `VirtualToolMessageHandler` lock when `messageIndex` is unknown (avoid all `-1` sharing one lock). */
export function stableVirtualToolMessageIdFromRecord(record: Record<string, unknown> | undefined): string {
  if (!record) return '-1'
  const mes = typeof record.mes === 'string' ? record.mes : typeof record.message === 'string' ? record.message : ''
  let hash = 5381
  for (let i = 0; i < mes.length; i += 1) {
    hash = (hash * 33) ^ mes.charCodeAt(i)
  }
  return `obj-${mes.length}-${(hash >>> 0).toString(16)}`
}
