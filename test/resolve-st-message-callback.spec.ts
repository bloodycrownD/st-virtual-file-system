import { describe, expect, it } from 'vitest'
import {
  resolveChatMessageTarget,
  stableVirtualToolMessageIdFromRecord,
  summarizeStMessageCallbackArgs0,
} from '@/app/services/message/resolve-st-message-callback'

describe('resolve-st-message-callback', () => {
  it('parses numeric string index as chat slot', () => {
    const chat = [{ mes: 'a' }, { mes: 'b' }]
    expect(resolveChatMessageTarget(['1'], chat)).toEqual({ messageIndex: 1, record: chat[1] })
  })

  it('matches message object by reference in chat', () => {
    const row = { mes: 'x' }
    const chat = [{ mes: 'a' }, row]
    expect(resolveChatMessageTarget([row], chat)).toEqual({ messageIndex: 1, record: row })
  })

  it('uses message-like first arg even when not in chat (orphan payload)', () => {
    const chat = [{ mes: 'slot' }]
    const orphan = { mes: 'orphan-body' }
    expect(resolveChatMessageTarget([orphan], chat)).toEqual({ messageIndex: -1, record: orphan })
  })

  it('reads nested index field on message object', () => {
    const chat = [{ mes: 'a' }, { mes: 'b' }]
    const wrapper = { index: 1, mes: 'ignored' }
    expect(resolveChatMessageTarget([wrapper], chat)).toEqual({ messageIndex: 1, record: chat[1] })
  })

  it('scans later args for message object', () => {
    const chat: Array<Record<string, unknown>> = []
    const msg = { mes: 'only-in-second' }
    expect(resolveChatMessageTarget([null, msg], chat)).toEqual({ messageIndex: -1, record: msg })
  })

  it('stableVirtualToolMessageIdFromRecord is deterministic for same mes', () => {
    const a = stableVirtualToolMessageIdFromRecord({ mes: 'hello' })
    const b = stableVirtualToolMessageIdFromRecord({ mes: 'hello' })
    expect(a).toBe(b)
    expect(a.startsWith('obj-')).toBe(true)
  })

  it('summarizeStMessageCallbackArgs0 avoids leaking mes body', () => {
    expect(summarizeStMessageCallbackArgs0({ mes: 'secret', foo: 1 })).toContain('object(keys=')
    expect(summarizeStMessageCallbackArgs0({ mes: 'secret', foo: 1 })).not.toContain('secret')
  })
})
