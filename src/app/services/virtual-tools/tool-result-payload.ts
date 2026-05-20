export type ResultCallDisplay = {
  tool: string
  args?: Record<string, unknown>
  argsSummary?: string
}

export function summarizeToolArgs(args: Record<string, unknown>): string {
  const keys = Object.keys(args)
  return keys.slice(0, 4).join(',')
}

/**
 * Build `calls` entries for result JSON.
 *
 * @param includeFullArgs - When true, each item is `{ tool, args }`; otherwise `{ tool, argsSummary }`.
 * Message-tag success uses `virtualToolResultFullArgsEnabled`; failures always pass true.
 * Function Calling keeps `includeFullArgs = !batch.ok` only (does not read the extension toggle).
 */
export function buildResultCallsDisplay(
  calls: Array<{ tool: string; args?: Record<string, unknown> }>,
  includeFullArgs: boolean,
): ResultCallDisplay[] {
  return calls.map((call) => {
    const args = call.args ?? {}
    if (includeFullArgs) {
      return { tool: call.tool, args }
    }
    return { tool: call.tool, argsSummary: summarizeToolArgs(args) }
  })
}
