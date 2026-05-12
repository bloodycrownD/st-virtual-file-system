import { describe, expect, it } from 'vitest'
import { createVfsPersistenceStore } from '@/app/stores/vfs-persistence-store'
import { ToolDispatcher } from '@/app/services/virtual-tools/tool-dispatcher'
import { ChatVfsRuntime } from '@/app/services/vfs-runtime/chat-vfs-runtime'
import { ChatVfsSnapshotService } from '@/app/services/vfs-snapshot/chat-vfs-snapshot-service'
import { DeflateContentCodec } from '@/infra/serialization/deflate-codec'
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
  it('rejects calls missing args object before dispatch', () => {
    const store = createVfsPersistenceStore(createAdapterMock())
    store.init()
    const before = JSON.stringify(store.getState().chat.chatVfsSnapshot)
    const runtime = new ChatVfsRuntime(
      store,
      new ToolDispatcher(),
      new ChatVfsSnapshotService(store, new DeflateContentCodec()),
    )
    const failed = runtime.executeBatch({
      calls: [{ tool: 'list' } as never],
    })
    expect(failed.ok).toBe(false)
    expect(failed.errorCode).toBe('INVALID_CALL_ARGS')
    expect(JSON.stringify(store.getState().chat.chatVfsSnapshot)).toBe(before)
  })

  it('commits whole batch when all tools succeed', () => {
    const store = createVfsPersistenceStore(createAdapterMock())
    store.init()
    const runtime = new ChatVfsRuntime(
      store,
      new ToolDispatcher(),
      new ChatVfsSnapshotService(store, new DeflateContentCodec()),
    )
    const result = runtime.executeBatch({
      calls: [
        { tool: 'write', args: { path: '/a.txt', content: '1' } },
        { tool: 'append', args: { path: '/a.txt', content: '2' } },
      ],
    })
    expect(result.ok).toBe(true)
    expect(store.getState().chat.chatVfsSnapshot).not.toBeNull()
    expect(store.getState().chat.chatVfsSnapshots.length).toBe(1)
  })

  it('rolls back batch when one tool fails', () => {
    const store = createVfsPersistenceStore(createAdapterMock())
    store.init()
    const before = JSON.stringify(store.getState().chat.chatVfsSnapshot)
    const runtime = new ChatVfsRuntime(
      store,
      new ToolDispatcher(),
      new ChatVfsSnapshotService(store, new DeflateContentCodec()),
    )
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
    expect(JSON.stringify(store.getState().chat.chatVfsSnapshot)).toBe(before)
  })
})
