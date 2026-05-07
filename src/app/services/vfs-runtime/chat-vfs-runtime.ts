import { VfsCore } from '@/domain/vfs/vfs-core'
import { DeflateContentCodec } from '@/infra/serialization/deflate-codec'
import type { VfsPersistenceStore } from '@/app/stores/vfs-persistence-store'
import type { ToolDispatcher, ToolBatchExecutionResult } from '@/app/services/virtual-tools/tool-dispatcher'
import type { ToolCallEnvelope } from '@/app/services/virtual-tools/tool-contracts'
import type { ChatVfsVersionService } from '@/app/services/vfs-version/chat-vfs-version-service'

export class ChatVfsRuntime {
  constructor(
    private readonly store: VfsPersistenceStore,
    private readonly dispatcher: ToolDispatcher,
    private readonly versionService: ChatVfsVersionService,
  ) {}

  executeBatch(envelope: ToolCallEnvelope): ToolBatchExecutionResult {
    const state = this.store.getState()
    const working = new VfsCore(new DeflateContentCodec())
    if (state.chat.chatVfsSnapshot) {
      working.importSnapshot(state.chat.chatVfsSnapshot)
    }
    const before = JSON.stringify(working.exportSnapshot())
    const result = this.dispatcher.executeEnvelope(envelope, working)
    if (!result.ok) {
      return result
    }
    const afterSnapshot = working.exportSnapshot()
    const changedFiles = this.diffChangedPaths(before, JSON.stringify(afterSnapshot))
    // Apply only after all tool calls succeed to preserve transactional semantics.
    this.store.updateChat((draft) => ({ ...draft, chatVfsSnapshot: afterSnapshot }))
    this.versionService.commitByToolBatch(`tool-batch (${envelope.calls.length} calls)`, changedFiles)
    return result
  }

  private diffChangedPaths(before: string, after: string): string[] {
    if (before === after) return []
    return ['*']
  }
}
