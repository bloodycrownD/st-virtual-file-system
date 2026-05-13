import { describe, expect, it } from 'vitest'
import { extractLastCallBlock, replaceCallWithResult, validateSingleResultTag } from '@/app/services/message/virtual-tool-tag-manager'

describe('virtual-tool-tag-manager', () => {
  it('extracts only the last call block', () => {
    const text =
      'a<virtual-tool-call>{"calls":[{"tool":"read","args":{"path":"/a"}}]}</virtual-tool-call>b<virtual-tool-call>{"calls":[{"tool":"write","args":{"path":"/b","content":"x"}}]}</virtual-tool-call>'
    const block = extractLastCallBlock(text)
    expect(block?.content).toContain('"write"')
  })

  it('replaces call block with result block', () => {
    const text = 'hello<virtual-tool-call>{"calls":[]}</virtual-tool-call>world'
    const block = extractLastCallBlock(text)
    expect(block).not.toBeNull()
    const replaced = replaceCallWithResult(text, block!, { ok: true })
    expect(replaced).toContain('<virtual-tool-result>')
    expect(replaced).not.toContain('<virtual-tool-call>')
  })

  it('rejects messages with multiple result tags', () => {
    const text = '<virtual-tool-result>a</virtual-tool-result><virtual-tool-result>b</virtual-tool-result>'
    const state = validateSingleResultTag(text)
    expect(state.ok).toBe(false)
    expect(state.count).toBe(2)
  })
})
