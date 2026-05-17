import { describe, expect, it } from 'vitest'
import { renderPlainTextDocument } from '@/app/services/vfs/renderPipeline'

describe('renderPlainTextDocument', () => {
  it('T-PLAIN-01: does not parse markdown headings', () => {
    const result = renderPlainTextDocument('# hi')
    expect(result.ok).toBe(true)
    const html = result.html ?? ''
    expect(html).not.toMatch(/<h1/i)
    expect(html).toMatch(/# hi|&lt;/)
  })

  it('T-PLAIN-02: preserves newlines via pre-wrap div (no code-block pre)', () => {
    const result = renderPlainTextDocument('line one\nline two')
    expect(result.ok).toBe(true)
    const html = result.html ?? ''
    expect(html).toContain('vfs-plain-text')
    expect(html).not.toMatch(/<pre[\s>]/i)
    expect(html).toContain('line one')
    expect(html).toContain('line two')
  })
})
