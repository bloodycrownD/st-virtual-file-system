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

  it('T-PLAIN-02: preserves newlines as br or pre-wrap', () => {
    const result = renderPlainTextDocument('line one\nline two')
    expect(result.ok).toBe(true)
    const html = result.html ?? ''
    expect(html).toContain('<br>')
    expect(html).toContain('vfs-plain-text')
  })
})
