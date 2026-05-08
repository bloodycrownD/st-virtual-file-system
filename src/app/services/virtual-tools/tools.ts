import type { VfsStat } from '@/domain/vfs/types'
import type { ToolResultItem, VirtualTool } from './tool-contracts'

/**
 * @module tools
 *
 * Built-in virtual tools for operating on a **chat-scoped VFS**.
 *
 * These tools are designed to sit behind a protocol boundary:
 * - The dispatcher ensures each call has an `args` **plain object**.
 * - Each tool validates its own required fields and enforces **safety caps** where applicable.
 *
 * Conventions:
 * - Tools should be deterministic and side-effect only the provided `context.vfs`.
 * - Safety limits in tools (e.g., read truncation) are **hard caps**; caller-provided limits may
 *   tighten behavior but must never expand beyond the hard cap.
 */

/** 统一参数解码：所有工具都走同一层，避免每个工具重复写判空逻辑。 */
function asPath(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('path must be a non-empty string')
  }
  return value
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback
}

function requireInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive integer`)
  }
  return value
}

function truncateText(input: string, maxChars: number): { text: string; truncated: boolean } {
  if (input.length <= maxChars) {
    return { text: input, truncated: false }
  }
  return { text: input.slice(0, maxChars), truncated: true }
}

function toLines(content: string): string[] {
  return content.split('\n')
}

/**
 * Read a file from the VFS with strict truncation.
 *
 * Required args:
 * - `path`: non-empty string
 *
 * Optional args:
 * - `startLine` (default 1): 1-based, clamped to \(\ge 1\)
 * - `endLine` (default `startLine + 499`): clamped to \(\ge startLine\)
 * - `maxLines` (default hard cap): caller may tighten, never loosen
 * - `maxChars` (default hard cap): caller may tighten, never loosen
 *
 * Safety caps (hard limits):
 * - Max lines returned: 500
 * - Max characters returned: 20000
 */
export const readTool: VirtualTool = {
  name: 'read',
  execute(args, context): ToolResultItem {
    // 硬上限写死在工具内，调用方参数只能“收紧”不能“放宽”。
    const HARD_MAX_LINES = 500
    const HARD_MAX_CHARS = 20000
    const path = asPath(args.path)
    const startLine = Math.max(1, asNumber(args.startLine, 1))
    const endLine = Math.max(startLine, asNumber(args.endLine, startLine + 499))
    // Caller-provided limits can tighten reads, but never bypass hard safety caps.
    const requestedMaxLines = Math.max(1, asNumber(args.maxLines, HARD_MAX_LINES))
    const requestedMaxChars = Math.max(1, asNumber(args.maxChars, HARD_MAX_CHARS))
    const maxLines = Math.min(HARD_MAX_LINES, requestedMaxLines)
    const maxChars = Math.min(HARD_MAX_CHARS, requestedMaxChars)
    const full = context.vfs.readFile(path)
    const lines = toLines(full)
    const until = Math.min(lines.length, Math.min(endLine, startLine + maxLines - 1))
    const selected = lines.slice(startLine - 1, until).join('\n')
    const limited = truncateText(selected, maxChars)
    const lineTruncated = until < Math.min(lines.length, endLine)
    return {
      tool: 'read',
      ok: true,
      summary: limited.truncated || lineTruncated ? `Read ${path} (truncated)` : `Read ${path}`,
      data: {
        path,
        startLine,
        endLine: until,
        content: limited.text,
        truncated: limited.truncated || lineTruncated,
        truncation: {
          byLines: lineTruncated,
          byChars: limited.truncated,
        },
      },
    }
  },
}

/**
 * Write (replace) a file in the VFS.
 *
 * Required args:
 * - `path`: non-empty string
 *
 * Optional args:
 * - `content`: string (defaults to empty string if omitted / not a string)
 *
 * Safety behavior:
 * - Parent directories are created automatically (`createParents: true`) to reduce extra tool calls.
 */
export const writeTool: VirtualTool = {
  name: 'write',
  execute(args, context): ToolResultItem {
    const path = asPath(args.path)
    const content = typeof args.content === 'string' ? args.content : ''
    // 约定：write 自动补父目录，减少模型为了 mkdir 产生额外调用。
    context.vfs.writeFile(path, content, { createParents: true, updatedBy: 'assistant' })
    return { tool: 'write', ok: true, summary: `Wrote ${path}` }
  },
}

/**
 * Delete a file or directory from the VFS.
 *
 * Required args:
 * - `path`: non-empty string
 *
 * Optional args:
 * - `recursive`: boolean (defaults to `false`)
 *
 * Safety behavior:
 * - Recursive directory deletion is **opt-in** (`recursive=true`) to reduce accidental tree wipes.
 */
export const deleteTool: VirtualTool = {
  name: 'delete',
  execute(args, context): ToolResultItem {
    const path = asPath(args.path)
    // 目录删除必须显式传 recursive=true，防止误删整棵目录。
    const recursive = args.recursive === true
    context.vfs.delete(path, { recursive })
    return { tool: 'delete', ok: true, summary: `Deleted ${path}` }
  },
}

/**
 * Append text to a file in the VFS.
 *
 * Required args:
 * - `path`: non-empty string
 *
 * Optional args:
 * - `content`: string (defaults to empty string if omitted / not a string)
 *
 * Semantics:
 * - If the file does not exist, it is treated as empty and then written.
 * - Parent directories are created automatically (`createParents: true`).
 */
export const appendTool: VirtualTool = {
  name: 'append',
  execute(args, context): ToolResultItem {
    const path = asPath(args.path)
    const appended = typeof args.content === 'string' ? args.content : ''
    // append 语义：不存在则视作空文件后再写入。
    const previous = context.vfs.exists(path) ? context.vfs.readFile(path) : ''
    context.vfs.writeFile(path, `${previous}${appended}`, { createParents: true, updatedBy: 'assistant' })
    return { tool: 'append', ok: true, summary: `Appended ${path}` }
  },
}

/**
 * Line-range update with exact-match guard.
 *
 * Required args:
 * - `path`: non-empty string
 * - `startLine`: positive integer (1-based)
 * - `endLine`: positive integer, must be \(\ge startLine\)
 * - `expectedOldContent`: string; must exactly match the current file segment
 * - `newContent`: string; replacement content for the given range
 *
 * Safety behavior:
 * - Rejects ambiguous updates by requiring an **exact match** of the existing segment before writing.
 *   This prevents silent "line drift" overwrites when the file changed since the caller planned the edit.
 */
export const updateTool: VirtualTool = {
  name: 'update',
  execute(args, context): ToolResultItem {
    const path = asPath(args.path)
    // Reject ambiguous update payloads to avoid accidental broad rewrites.
    const startLine = requireInteger(args.startLine, 'startLine')
    const endLine = requireInteger(args.endLine, 'endLine')
    if (endLine < startLine) {
      throw new Error('endLine must be greater than or equal to startLine')
    }
    if (typeof args.expectedOldContent !== 'string') {
      throw new Error('expectedOldContent is required')
    }
    if (typeof args.newContent !== 'string') {
      throw new Error('newContent is required')
    }
    const expected = args.expectedOldContent
    const replacement = args.newContent
    const full = context.vfs.readFile(path)
    const lines = toLines(full)
    const existingSegment = lines.slice(startLine - 1, endLine).join('\n')
    // We enforce exact-match replacement to prevent silent line-drift writes.
    if (existingSegment !== expected) {
      throw new Error('expectedOldContent mismatch')
    }
    lines.splice(startLine - 1, endLine - startLine + 1, ...toLines(replacement))
    context.vfs.writeFile(path, lines.join('\n'), { createParents: true, updatedBy: 'assistant' })
    return { tool: 'update', ok: true, summary: `Updated ${path}:${startLine}-${endLine}` }
  },
}

/**
 * List directory entries within the VFS.
 *
 * Required args:
 * - `path`: non-empty string
 *
 * Returns:
 * - `data`: `VfsStat[]` describing each entry.
 */
export const listTool: VirtualTool = {
  name: 'list',
  execute(args, context): ToolResultItem {
    const path = asPath(args.path)
    const items: VfsStat[] = context.vfs.list(path)
    return { tool: 'list', ok: true, summary: `Listed ${path}`, data: items }
  },
}

/**
 * Search file contents under a VFS path.
 *
 * Required args:
 * - (none) — but providing a non-empty `query` is usually necessary for meaningful results
 *
 * Optional args:
 * - `query`: string (defaults to empty string)
 * - `regex`: boolean (defaults to `false`)
 * - `path`: root path to search from (defaults to `/`)
 *
 * Notes:
 * - When `regex=true`, the query is compiled as `new RegExp(query, 'i')` (case-insensitive).
 * - This tool currently loads each file content to test for a match; callers should prefer narrow roots.
 */
export const searchTool: VirtualTool = {
  name: 'search',
  execute(args, context): ToolResultItem {
    const query = typeof args.query === 'string' ? args.query : ''
    const regexEnabled = args.regex === true
    const rootPath = typeof args.path === 'string' ? args.path : '/'
    const stats = context.vfs.walk(rootPath).filter((item) => item.type === 'file')
    // regex 模式默认忽略大小写，保持与纯文本模式默认行为一致。
    const matcher = regexEnabled ? new RegExp(query, 'i') : null
    const matches = stats
      .map((item) => {
        const content = context.vfs.readFile(item.path)
        const hit = regexEnabled ? matcher?.test(content) : content.toLowerCase().includes(query.toLowerCase())
        return hit ? item.path : null
      })
      .filter((item): item is string => Boolean(item))
    return { tool: 'search', ok: true, summary: `Search found ${matches.length} file(s)`, data: { matches } }
  },
}

/**
 * Returns the default built-in tool set registered by the dispatcher.
 *
 * The order is not semantically meaningful, but results are produced in call order at runtime.
 */
export function createDefaultVirtualTools(): VirtualTool[] {
  return [readTool, writeTool, deleteTool, updateTool, appendTool, listTool, searchTool]
}
