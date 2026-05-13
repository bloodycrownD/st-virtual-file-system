import { describe, expect, it } from 'vitest'
import { createVfsPersistenceStore } from '@/app/stores/vfs-persistence-store'
import { ToolDispatcher } from '@/app/services/virtual-tools/tool-dispatcher'
import { ChatVfsRuntime } from '@/app/services/vfs-runtime/chat-vfs-runtime'
import { ChatVfsCheckpointService } from '@/app/services/vfs-checkpoint/chat-vfs-checkpoint-service'
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
      new ChatVfsCheckpointService(store, new DeflateContentCodec()),
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
      new ChatVfsCheckpointService(store, new DeflateContentCodec()),
    )
    const startedAt = Date.now()
    const result = runtime.executeBatch(
      {
        calls: [
          { tool: 'write', args: { path: '/a.txt', content: '1' } },
          { tool: 'append', args: { path: '/a.txt', content: '2' } },
        ],
      },
      { chatId: 'c', messageId: 'm', startedAt, batchId: 'b1' },
    )
    expect(result.ok).toBe(true)
    expect(store.getState().chat.chatVfsSnapshot).not.toBeNull()
    const cps = store.getState().chat.vfsCheckpoints
    expect(cps.length).toBe(1)
    const batchLog = store.getState().chat.chatVfsLogs.find((e) => e.toolName === 'batch' && e.batchId === 'b1')
    expect(batchLog?.checkpointId).toBeTruthy()
    expect(cps.some((c) => c.id === batchLog?.checkpointId)).toBe(true)
  })

  it('rolls back batch when one tool fails', () => {
    const store = createVfsPersistenceStore(createAdapterMock())
    store.init()
    const before = JSON.stringify(store.getState().chat.chatVfsSnapshot)
    const runtime = new ChatVfsRuntime(
      store,
      new ToolDispatcher(),
      new ChatVfsCheckpointService(store, new DeflateContentCodec()),
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
