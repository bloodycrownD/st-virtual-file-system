import type { ToolCallEnvelope, ToolResultItem, VirtualTool } from './tool-contracts'
import { createDefaultVirtualTools } from './tools'
import type { VfsCore } from '@/domain/vfs/vfs-core'

export interface ToolBatchExecutionResult {
  ok: boolean
  results: ToolResultItem[]
  errorCode?: string
  errorMessage?: string
}

export interface ToolDispatcherOptions {
  maxCalls: number
  timeoutMs: number
}

const DEFAULT_OPTIONS: ToolDispatcherOptions = {
  maxCalls: 10,
  timeoutMs: 5000,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export class ToolDispatcher {
  private readonly tools: Map<string, VirtualTool>
  private readonly options: ToolDispatcherOptions

  constructor(registeredTools: VirtualTool[] = createDefaultVirtualTools(), options: Partial<ToolDispatcherOptions> = {}) {
    this.tools = new Map(registeredTools.map((tool) => [tool.name, tool]))
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  executeEnvelope(envelope: ToolCallEnvelope, vfs: VfsCore): ToolBatchExecutionResult {
    if (!envelope || !Array.isArray(envelope.calls)) {
      return { ok: false, results: [], errorCode: 'INVALID_ENVELOPE', errorMessage: 'Envelope must include calls[]' }
    }
    if (envelope.calls.length > this.options.maxCalls) {
      return {
        ok: false,
        results: [],
        errorCode: 'CALL_LIMIT_EXCEEDED',
        errorMessage: `Maximum ${this.options.maxCalls} calls allowed per batch`,
      }
    }

    const startedAt = Date.now()
    const results: ToolResultItem[] = []
    for (const call of envelope.calls) {
      // Guard protocol boundaries before entering tool dispatch.
      if (!call || typeof call.tool !== 'string' || call.tool.trim() === '' || !isRecord(call.args)) {
        return {
          ok: false,
          results,
          errorCode: 'INVALID_CALL_ARGS',
          errorMessage: 'Each call must include a tool name and args object',
        }
      }
      if (Date.now() - startedAt > this.options.timeoutMs) {
        return { ok: false, results, errorCode: 'BATCH_TIMEOUT', errorMessage: 'Tool batch timed out' }
      }
      const tool = this.tools.get(call.tool)
      if (!tool) {
        return {
          ok: false,
          results,
          errorCode: 'UNKNOWN_TOOL',
          errorMessage: `Unsupported tool: ${call.tool}`,
        }
      }
      try {
        const result = tool.execute(call.args, { vfs })
        results.push(result)
      } catch (error) {
        return {
          ok: false,
          results,
          errorCode: 'TOOL_EXECUTION_FAILED',
          errorMessage: error instanceof Error ? error.message : String(error),
        }
      }
    }
    return { ok: true, results }
  }
}
