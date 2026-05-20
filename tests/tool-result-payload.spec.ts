import { describe, expect, it } from 'vitest'
import { buildResultCallsDisplay } from '@/app/services/virtual-tools/tool-result-payload'
import { formatFunctionToolResult } from '@/infra/sillytarvern/function-tools/format-function-tool-result'

describe('tool result payload', () => {
  it('includes full args in result calls when batch failed', () => {
    const calls = buildResultCallsDisplay(
      [{ tool: 'replace', args: { path: '/a.txt', oldContent: 'x', newContent: 'y' } }],
      true,
    )
    expect(calls[0]?.args).toEqual({ path: '/a.txt', oldContent: 'x', newContent: 'y' })
    expect(calls[0]?.argsSummary).toBeUndefined()
  })

  it('uses argsSummary only when batch succeeded', () => {
    const calls = buildResultCallsDisplay(
      [{ tool: 'write', args: { path: '/a.txt', content: 'hello' } }],
      false,
    )
    expect(calls[0]?.argsSummary).toBe('path,content')
    expect(calls[0]?.args).toBeUndefined()
  })

  it('formatFunctionToolResult uses argsSummary on FC success regardless of extension toggle', () => {
    const json = formatFunctionToolResult(
      {
        ok: true,
        results: [{ tool: 'write', ok: true, summary: 'ok' }],
      },
      { calls: [{ tool: 'write', args: { path: '/a.txt', content: 'hello' } }] },
    )
    const parsed = JSON.parse(json) as {
      calls: Array<{ tool: string; args?: Record<string, unknown>; argsSummary?: string }>
    }
    expect(parsed.calls[0]?.argsSummary).toBe('path,content')
    expect(parsed.calls[0]?.args).toBeUndefined()
  })

  it('formatFunctionToolResult embeds full args on FC failure', () => {
    const json = formatFunctionToolResult(
      {
        ok: false,
        results: [],
        errorCode: 'TOOL_EXECUTION_FAILED',
        errorMessage: 'oldContent not found',
      },
      { calls: [{ tool: 'replace', args: { path: '/a.txt', oldContent: 'missing', newContent: 'y' } }] },
    )
    const parsed = JSON.parse(json) as { calls: Array<{ tool: string; args: Record<string, unknown> }> }
    expect(parsed.calls[0]?.args).toEqual({ path: '/a.txt', oldContent: 'missing', newContent: 'y' })
  })
})
