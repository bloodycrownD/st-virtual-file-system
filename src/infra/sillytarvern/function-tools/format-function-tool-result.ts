/**
 * @file Serializes virtual-tool batch results for SillyTavern Function Calling `action` returns.
 */
import {
  buildResultCallsDisplay,
  type ResultCallDisplay,
} from '@/app/services/virtual-tools/tool-result-payload'
import type { ToolBatchExecutionResult } from '@/app/services/virtual-tools/tool-dispatcher'
import type { ToolResultItem } from '@/app/services/virtual-tools/tool-contracts'

function serializeResultItem(item: ToolResultItem): Record<string, unknown> {
  const out: Record<string, unknown> = {
    tool: item.tool,
    ok: item.ok,
    summary: item.summary,
  }
  if (item.data !== undefined) {
    out.data = item.data
  }
  if (item.errorCode) {
    out.errorCode = item.errorCode
  }
  return out
}

export interface FormatFunctionToolResultOptions {
  calls?: Array<{ tool: string; args?: Record<string, unknown> }>
}

/** Stable JSON string for LLM consumption (success and per-tool failure shapes). */
export function formatFunctionToolResult(
  batch: ToolBatchExecutionResult,
  options?: FormatFunctionToolResultOptions,
): string {
  const payload: Record<string, unknown> = {
    ok: batch.ok,
    results: batch.results.map(serializeResultItem),
  }
  if (options?.calls) {
    payload.calls = buildResultCallsDisplay(options.calls, !batch.ok) as ResultCallDisplay[]
  }
  if (!batch.ok) {
    if (batch.errorCode) {
      payload.errorCode = batch.errorCode
    }
    if (batch.errorMessage) {
      payload.errorMessage = batch.errorMessage
    }
  }
  return JSON.stringify(payload)
}
