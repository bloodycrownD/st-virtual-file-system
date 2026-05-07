import type { VfsCore } from '@/domain/vfs/vfs-core'

/**
 * @module tool-contracts
 *
 * Type contracts for the **virtual tools** protocol.
 *
 * This module is intentionally **types-only** and sits on the protocol boundary between:
 * - a caller that produces tool calls (often an LLM / tool-planning layer), and
 * - the tool runtime that validates and executes those calls against an in-memory VFS.
 *
 * Key invariants expected by the dispatcher and tools:
 * - Every call must provide a **non-empty** `tool` name.
 * - Every call must provide an `args` value that is a **plain object** (`Record<string, unknown>`).
 *   (No arrays, no null, no primitives.) This simplifies validation and avoids ambiguous payload shapes.
 */

/**
 * A single tool invocation request.
 *
 * - `tool` selects the capability by name.
 * - `args` is the tool-specific argument object. It is required to be a plain object so that
 *   the dispatcher can reject malformed calls before execution.
 */
export interface ToolCallItem {
  tool: string
  args: Record<string, unknown>
}

/**
 * Batch call envelope.
 *
 * The extra wrapper makes it easy to validate payload shape (`calls[]`) and leaves room for
 * future protocol evolution without changing the outer transport format.
 */
export interface ToolCallEnvelope {
  calls: ToolCallItem[]
}

/**
 * A tool execution result.
 *
 * - `summary` is meant to be **human/LLM readable** (short, informative).
 * - `data` is an optional **structured payload** for downstream code to consume.
 * - `ok=false` results may include `errorCode` for programmatic handling.
 */
export interface ToolResultItem {
  tool: string
  ok: boolean
  summary: string
  data?: unknown
  errorCode?: string
}

/**
 * Minimal execution context exposed to tools.
 *
 * Only a **chat-scoped VFS** is provided. Tools must not access the host filesystem directly.
 */
export interface ToolExecutionContext {
  /** 运行期只暴露 chat 工作副本 VFS，工具不可直接接触真实文件系统。 */
  vfs: VfsCore
}

/**
 * A virtual tool implementation.
 *
 * Contract notes:
 * - The dispatcher guarantees `args` is a plain object (`Record<string, unknown>`), but tools are
 *   still responsible for validating required fields and rejecting invalid values.
 * - Tools should return a `ToolResultItem` rather than throwing for expected validation errors.
 *   (The dispatcher will catch thrown errors and convert them into a batch-level failure.)
 */
export interface VirtualTool {
  readonly name: string
  execute: (args: Record<string, unknown>, context: ToolExecutionContext) => ToolResultItem
}
