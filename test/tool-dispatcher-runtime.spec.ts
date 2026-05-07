import { describe, expect, it } from 'vitest'
import { createVfsPersistenceStore } from '@/app/stores/vfs-persistence-store'
import { ToolDispatcher } from '@/app/services/virtual-tools/tool-dispatcher'
import { ChatVfsRuntime } from '@/app/services/vfs-runtime/chat-vfs-runtime'
import { ChatVfsVersionService } from '@/app/services/vfs-version/chat-vfs-version-service'
import type { StContextAdapter } from '@/infra/persistence/st-context-adapter'

function createAdapterMock(): StContextAdapter {
  let ext: Record<string, unknown> = {}
  let chat: Record<string, unknown> = {}
  return {
    readExtensionRaw: () => ext,
    writeExtensionRaw: (raw) => {
      ext = raw
    },
    saveExtension: () => {},
    readChatRaw: () => chat,
    writeChatRaw: (raw) => {
      chat = raw
    },
    saveChat: () => {},
  }
}

describe('tool-dispatcher + runtime', () => {
  it('commits whole batch when all tools succeed', () => {
    const store = createVfsPersistenceStore(createAdapterMock())
    store.init()
    const runtime = new ChatVfsRuntime(store, new ToolDispatcher(), new ChatVfsVersionService(store))
    const result = runtime.executeBatch({
      calls: [
        { tool: 'write', args: { path: '/a.txt', content: '1' } },
        { tool: 'append', args: { path: '/a.txt', content: '2' } },
      ],
    })
    expect(result.ok).toBe(true)
    expect(store.getState().chat.chatVfsSnapshot).not.toBeNull()
    expect(store.getState().chat.chatVfsVersions.length).toBe(1)
  })

  it('rolls back batch when one tool fails', () => {
    const store = createVfsPersistenceStore(createAdapterMock())
    store.init()
    const runtime = new ChatVfsRuntime(store, new ToolDispatcher(), new ChatVfsVersionService(store))
    const failed = runtime.executeBatch({
      calls: [
        { tool: 'write', args: { path: '/a.txt', content: '1' } },
        {
          tool: 'update',
          args: { path: '/a.txt', startLine: 1, endLine: 1, expectedOldContent: 'x', newContent: 'ok' },
        },
      ],
    })
    expect(failed.ok).toBe(false)
    expect(store.getState().chat.chatVfsSnapshot).toBeNull()
  })
})
