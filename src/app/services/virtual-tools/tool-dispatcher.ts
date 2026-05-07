import type { ToolCallEnvelope, ToolResultItem, VirtualTool } from './tool-contracts'
import { createDefaultVirtualTools } from './tools'
import type { VfsCore } from '@/domain/vfs/vfs-core'

/**
 * @module tool-dispatcher
 *
 * Orchestrates **batch execution** of virtual tools.
 *
 * Responsibilities:
 * - **Protocol boundary validation**: enforce envelope shape and require `args` to be a plain object.
 * - **Resource/safety caps**: `maxCalls` limits batch fan-out; `timeoutMs` bounds total wall-clock time.
 * - **Fail-fast semantics**: stop the batch on the first invalid call, unknown tool, thrown tool error,
 *   or batch timeout (while returning partial results collected so far).
 *
 * Timeout semantics are **strict**:
 * - A single `startedAt` timestamp is captured for the whole batch.
 * - Time budget is checked **before** executing each call and **after** each call returns, so batches
 *   fail even if one tool runs long and returns "success".
 */

/**
 * 工具调度器：
 * - 负责协议边界校验（envelope/call/args）
 * - 控制批次资源限制（maxCalls / timeout）
 * - 顺序执行工具并返回 fail-fast 结果
 */
export interface ToolBatchExecutionResult {
  ok: boolean
  results: ToolResultItem[]
  errorCode?: string
  errorMessage?: string
}

/**
 * Dispatcher safety limits for a single batch.
 *
 * - `maxCalls`: maximum number of calls allowed in `envelope.calls`.
 * - `timeoutMs`: wall-clock budget for the *entire batch* (not per-tool).
 */
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

/**
 * Executes a `ToolCallEnvelope` against a provided `VfsCore` instance.
 *
 * Design notes:
 * - **Args object requirement**: each call must include an `args` plain object, even if empty (`{}`),
 *   to avoid ambiguous payload shapes and simplify safe validation.
 * - **Fail-fast**: the first invalid call / unknown tool / tool exception / timeout ends the batch.
 *   Partial results from earlier successful calls are preserved in `results`.
 * - **Timeout is batch-wide**: the clock starts at batch entry and is enforced before and after each tool.
 */
export class ToolDispatcher {
  private readonly tools: Map<string, VirtualTool>
  private readonly options: ToolDispatcherOptions

  /**
   * @param registeredTools Tool implementations keyed by `tool.name`. Defaults to the built-ins.
   * @param options Optional overrides for batch safety limits.
   */
  constructor(registeredTools: VirtualTool[] = createDefaultVirtualTools(), options: Partial<ToolDispatcherOptions> = {}) {
    this.tools = new Map(registeredTools.map((tool) => [tool.name, tool]))
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  /**
   * Execute a validated batch envelope against the given VFS.
   *
   * Boundary checks performed here (before tool dispatch):
   * - `envelope.calls` must be an array
   * - total calls must not exceed `maxCalls`
   * - each call must have a non-empty string `tool` and an `args` plain object
   *
   * @returns A batch result. When `ok=false`, `errorCode` and `errorMessage` describe the first failure.
   */
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

    // 统一批次起点，所有 timeout 判定都基于同一 wall-clock。
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
      // pre-check：在进入下一个工具前先判定预算是否已耗尽。
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
        // post-check：覆盖“单工具执行过长”的场景，确保整批超时一定失败。
        if (Date.now() - startedAt > this.options.timeoutMs) {
          return { ok: false, results, errorCode: 'BATCH_TIMEOUT', errorMessage: 'Tool batch timed out' }
        }
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
