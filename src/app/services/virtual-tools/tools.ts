import type { VfsStat } from '@/domain/vfs/types'
import type { ToolResultItem, VirtualTool } from './tool-contracts'

function asPath(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('path must be a non-empty string')
  }
  return value
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback
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

export const readTool: VirtualTool = {
  name: 'read',
  execute(args, context): ToolResultItem {
    const path = asPath(args.path)
    const startLine = Math.max(1, asNumber(args.startLine, 1))
    const endLine = Math.max(startLine, asNumber(args.endLine, startLine + 499))
    const maxLines = Math.max(1, asNumber(args.maxLines, 500))
    const maxChars = Math.max(1, asNumber(args.maxChars, 20000))
    const full = context.vfs.readFile(path)
    const lines = toLines(full)
    const until = Math.min(lines.length, Math.min(endLine, startLine + maxLines - 1))
    const selected = lines.slice(startLine - 1, until).join('\n')
    const limited = truncateText(selected, maxChars)
    return {
      tool: 'read',
      ok: true,
      summary: limited.truncated ? `Read ${path} (truncated)` : `Read ${path}`,
      data: { path, startLine, endLine: until, content: limited.text, truncated: limited.truncated },
    }
  },
}

export const writeTool: VirtualTool = {
  name: 'write',
  execute(args, context): ToolResultItem {
    const path = asPath(args.path)
    const content = typeof args.content === 'string' ? args.content : ''
    context.vfs.writeFile(path, content, { createParents: true })
    return { tool: 'write', ok: true, summary: `Wrote ${path}` }
  },
}

export const deleteTool: VirtualTool = {
  name: 'delete',
  execute(args, context): ToolResultItem {
    const path = asPath(args.path)
    const recursive = args.recursive === true
    context.vfs.delete(path, { recursive })
    return { tool: 'delete', ok: true, summary: `Deleted ${path}` }
  },
}

export const appendTool: VirtualTool = {
  name: 'append',
  execute(args, context): ToolResultItem {
    const path = asPath(args.path)
    const appended = typeof args.content === 'string' ? args.content : ''
    const previous = context.vfs.exists(path) ? context.vfs.readFile(path) : ''
    context.vfs.writeFile(path, `${previous}${appended}`, { createParents: true })
    return { tool: 'append', ok: true, summary: `Appended ${path}` }
  },
}

export const updateTool: VirtualTool = {
  name: 'update',
  execute(args, context): ToolResultItem {
    const path = asPath(args.path)
    const startLine = Math.max(1, asNumber(args.startLine, 1))
    const endLine = Math.max(startLine, asNumber(args.endLine, startLine))
    const expected = typeof args.expectedOldContent === 'string' ? args.expectedOldContent : ''
    const replacement = typeof args.newContent === 'string' ? args.newContent : ''
    const full = context.vfs.readFile(path)
    const lines = toLines(full)
    const existingSegment = lines.slice(startLine - 1, endLine).join('\n')
    // We enforce exact-match replacement to prevent silent line-drift writes.
    if (existingSegment !== expected) {
      throw new Error('expectedOldContent mismatch')
    }
    lines.splice(startLine - 1, endLine - startLine + 1, ...toLines(replacement))
    context.vfs.writeFile(path, lines.join('\n'), { createParents: true })
    return { tool: 'update', ok: true, summary: `Updated ${path}:${startLine}-${endLine}` }
  },
}

export const listTool: VirtualTool = {
  name: 'list',
  execute(args, context): ToolResultItem {
    const path = asPath(args.path)
    const items: VfsStat[] = context.vfs.list(path)
    return { tool: 'list', ok: true, summary: `Listed ${path}`, data: items }
  },
}

export const searchTool: VirtualTool = {
  name: 'search',
  execute(args, context): ToolResultItem {
    const query = typeof args.query === 'string' ? args.query : ''
    const regexEnabled = args.regex === true
    const rootPath = typeof args.path === 'string' ? args.path : '/'
    const stats = context.vfs.walk(rootPath).filter((item) => item.type === 'file')
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

export function createDefaultVirtualTools(): VirtualTool[] {
  return [readTool, writeTool, deleteTool, updateTool, appendTool, listTool, searchTool]
}
