export type ResultCallDisplay = {
  tool: string
  args?: Record<string, unknown>
  argsSummary?: string
}

export function summarizeToolArgs(args: Record<string, unknown>): string {
  const keys = Object.keys(args)
  return keys.slice(0, 4).join(',')
}

/** Success: argsSummary only. Failure: full `args` for debugging. */
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
