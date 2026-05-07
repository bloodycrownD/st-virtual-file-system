import type { VfsCore } from '@/domain/vfs/vfs-core'

export interface ToolCallItem {
  tool: string
  args: Record<string, unknown>
}

export interface ToolCallEnvelope {
  calls: ToolCallItem[]
}

export interface ToolResultItem {
  tool: string
  ok: boolean
  summary: string
  data?: unknown
  errorCode?: string
}

export interface ToolExecutionContext {
  vfs: VfsCore
}

export interface VirtualTool {
  readonly name: string
  execute: (args: Record<string, unknown>, context: ToolExecutionContext) => ToolResultItem
}
