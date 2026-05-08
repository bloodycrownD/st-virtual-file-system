import { describe, expect, it } from 'vitest'
import { createVfsPersistenceStore } from '@/app/stores/vfs-persistence-store'
import { ToolDispatcher } from '@/app/services/virtual-tools/tool-dispatcher'
import { ChatVfsRuntime } from '@/app/services/vfs-runtime/chat-vfs-runtime'
import { ChatVfsVersionService } from '@/app/services/vfs-version/chat-vfs-version-service'
import { ExtensionVfsTemplateService } from '@/app/services/vfs-runtime/extension-vfs-template-service'
import { VirtualToolMessageHandler } from '@/app/services/message/virtual-tool-message-handler'
import { ChatVfsLogService } from '@/app/services/vfs-log/chat-vfs-log-service'
import type { VirtualTool } from '@/app/services/virtual-tools/tool-contracts'
import type { StContextAdapter } from '@/infra/persistence/st-context-adapter'

function createAdapterMock(extensionSeed: Record<string, unknown> = {}): StContextAdapter {
  let ext: Record<string, unknown> = extensionSeed
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

describe('virtual tool CR fixes', () => {
  it('enforces hard read caps regardless of caller-provided limits', () => {
    const store = createVfsPersistenceStore(createAdapterMock())
    store.init()
    const runtime = new ChatVfsRuntime(store, new ToolDispatcher(), new ChatVfsVersionService(store))
    const oversized = `L\n${'x'.repeat(25000)}`
    const result = runtime.executeBatch({
      calls: [
        { tool: 'write', args: { path: '/big.txt', content: oversized } },
        { tool: 'read', args: { path: '/big.txt', startLine: 1, maxLines: 9999, maxChars: 999999 } },
      ],
    })
    expect(result.ok).toBe(true)
    const readData = result.results[1]?.data as
      | { content: string; truncated: boolean; truncation?: { byLines?: boolean; byChars?: boolean } }
      | undefined
    expect(readData?.content.length).toBeLessThanOrEqual(20000)
    expect(readData?.truncated).toBe(true)
    expect(readData?.truncation?.byChars).toBe(true)
  })

  it('rejects update calls missing strict required fields', () => {
    const store = createVfsPersistenceStore(createAdapterMock())
    store.init()
    const runtime = new ChatVfsRuntime(store, new ToolDispatcher(), new ChatVfsVersionService(store))
    const result = runtime.executeBatch({
      calls: [
        { tool: 'write', args: { path: '/a.txt', content: 'before' } },
        { tool: 'update', args: { path: '/a.txt', newContent: 'after' } },
      ],
    })
    expect(result.ok).toBe(false)
    expect(result.errorCode).toBe('TOOL_EXECUTION_FAILED')
    expect(result.errorMessage).toContain('startLine')
  })

  it('re-initializes template on first runtime access after chat reload', () => {
    const store = createVfsPersistenceStore(
      createAdapterMock({
        extensionTemplateVfsSnapshot: {
          schemaVersion: 1,
          rootId: 'root',
          nodes: {
            root: { id: 'root', type: 'directory', path: '/', name: '', parentId: null, children: ['f'], mtime: 1 },
            f: {
              id: 'f',
              type: 'file',
              path: '/seed.txt',
              name: 'seed.txt',
              parentId: 'root',
              mtime: 1,
              size: 4,
              content: { encoding: 'plain', data: 'seed', originalSize: 4 },
            },
          },
        },
      }),
    )
    store.init()
    const versions = new ChatVfsVersionService(store)
    const templateService = new ExtensionVfsTemplateService(store, versions)
    const runtime = new ChatVfsRuntime(store, new ToolDispatcher(), versions, templateService)
    runtime.executeBatch({ calls: [{ tool: 'list', args: { path: '/' } }] })
    expect(store.getState().chat.templateInitialized).toBe(true)

    // Simulate chat reload that lands on a fresh chat metadata segment.
    store.updateChat((draft) => ({ ...draft, templateInitialized: false, chatVfsSnapshot: null }))
    runtime.executeBatch({ calls: [{ tool: 'list', args: { path: '/' } }] })
    expect(store.getState().chat.templateInitialized).toBe(true)
    expect(store.getState().chat.chatVfsSnapshot).not.toBeNull()
  })

  it('skips processing when virtualToolCallEnabled is disabled', () => {
    const store = createVfsPersistenceStore(createAdapterMock({ virtualToolCallEnabled: false }))
    store.init()
    const logs = new ChatVfsLogService(store)
    const runtime = new ChatVfsRuntime(store, new ToolDispatcher(), new ChatVfsVersionService(store))
    const before = JSON.stringify(store.getState().chat.chatVfsSnapshot)
    const handler = new VirtualToolMessageHandler(runtime, logs)
    const output = handler.process({
      chatId: 'chat',
      messageId: '1',
      messageText: '<virtual-tool-call>{"calls":[{"tool":"write","args":{"path":"/a.txt","content":"x"}}]}</virtual-tool-call>',
    })
    expect(output.handled).toBe(false)
    expect(JSON.stringify(store.getState().chat.chatVfsSnapshot)).toBe(before)
  })

  it('writes per-tool logs including truncation detail', () => {
    const store = createVfsPersistenceStore(createAdapterMock())
    store.init()
    const logs = new ChatVfsLogService(store)
    const runtime = new ChatVfsRuntime(store, new ToolDispatcher(), new ChatVfsVersionService(store))
    const handler = new VirtualToolMessageHandler(runtime, logs)
    handler.process({
      chatId: 'chat',
      messageId: '2',
      messageText:
        '<virtual-tool-call>{"calls":[{"tool":"write","args":{"path":"/big.txt","content":"' +
        'x'.repeat(22000) +
        '"}},{"tool":"read","args":{"path":"/big.txt","maxChars":999999}}]}</virtual-tool-call>',
    })
    const entries = store.getState().chat.chatVfsLogs
    expect(entries.some((entry) => entry.toolName === 'write')).toBe(true)
    expect(entries.some((entry) => entry.toolName === 'read')).toBe(true)
    expect(entries.some((entry) => entry.errorCode === 'READ_TRUNCATED')).toBe(true)
  })

  it('returns CALL_LIMIT_EXCEEDED in acceptance flow when calls exceed limit', () => {
    const store = createVfsPersistenceStore(createAdapterMock())
    store.init()
    const logs = new ChatVfsLogService(store)
    const runtime = new ChatVfsRuntime(store, new ToolDispatcher(undefined, { maxCalls: 1 }), new ChatVfsVersionService(store))
    const handler = new VirtualToolMessageHandler(runtime, logs)
    const output = handler.process({
      chatId: 'chat',
      messageId: 'call-limit',
      messageText:
        '<virtual-tool-call>{"calls":[{"tool":"list","args":{"path":"/"}},{"tool":"list","args":{"path":"/"}}]}</virtual-tool-call>',
    })
    expect(output.handled).toBe(true)
    expect(output.messageText).toContain('CALL_LIMIT_EXCEEDED')
  })

  it('returns BATCH_TIMEOUT in acceptance flow when total batch elapsed exceeds timeout', () => {
    const store = createVfsPersistenceStore(createAdapterMock())
    store.init()
    const logs = new ChatVfsLogService(store)
    const slowTool: VirtualTool = {
      name: 'slow',
      execute: () => {
        const stopAt = Date.now() + 30
        // Keep execution synchronous to validate dispatcher time-boundary checks.
        while (Date.now() < stopAt) {
          // noop busy wait
        }
        return { tool: 'slow', ok: true, data: { done: true } }
      },
    }
    const runtime = new ChatVfsRuntime(
      store,
      new ToolDispatcher([slowTool], { timeoutMs: 10 }),
      new ChatVfsVersionService(store),
    )
    const handler = new VirtualToolMessageHandler(runtime, logs)
    const output = handler.process({
      chatId: 'chat',
      messageId: 'timeout',
      messageText: '<virtual-tool-call>{"calls":[{"tool":"slow","args":{}}]}</virtual-tool-call>',
    })
    expect(output.handled).toBe(true)
    expect(output.messageText).toContain('BATCH_TIMEOUT')
  })

  it('guards against concurrent duplicate processing for the same chatId:messageId', () => {
    const store = createVfsPersistenceStore(createAdapterMock())
    store.init()
    const logs = new ChatVfsLogService(store)
    let handler: VirtualToolMessageHandler
    let nestedHandled: boolean | null = null
    const runtimeLike = {
      isVirtualToolCallEnabled: () => true,
      executeBatch: () => {
        nestedHandled = handler.process({
          chatId: 'chat',
          messageId: 'dup',
          messageText: '<virtual-tool-call>{"calls":[{"tool":"list","args":{"path":"/"}}]}</virtual-tool-call>',
        }).handled
        return { ok: true, results: [{ tool: 'list', ok: true, data: { path: '/', entries: [] } }] }
      },
    } as unknown as ChatVfsRuntime
    handler = new VirtualToolMessageHandler(runtimeLike, logs)
    const output = handler.process({
      chatId: 'chat',
      messageId: 'dup',
      messageText: '<virtual-tool-call>{"calls":[{"tool":"list","args":{"path":"/"}}]}</virtual-tool-call>',
    })
    expect(output.handled).toBe(true)
    expect(nestedHandled).toBe(false)
  })

  it('replaces malformed call blocks with failure result to avoid retrigger loop', () => {
    const store = createVfsPersistenceStore(createAdapterMock())
    store.init()
    const logs = new ChatVfsLogService(store)
    const runtime = new ChatVfsRuntime(store, new ToolDispatcher(), new ChatVfsVersionService(store))
    const handler = new VirtualToolMessageHandler(runtime, logs)
    const output = handler.process({
      chatId: 'chat',
      messageId: 'bad-json',
      messageText: '<virtual-tool-call>{"calls":[{"tool":"list","args":{"path":"/"}}]</virtual-tool-call>',
    })
    expect(output.handled).toBe(true)
    expect(output.messageText).not.toContain('<virtual-tool-call>')
    expect(output.messageText).toContain('<virtual-tool-result>')
    expect(output.messageText).toContain('INVALID_JSON')
  })

  it('replaces call block with unhandled error result when runtime throws unexpectedly', () => {
    const store = createVfsPersistenceStore(createAdapterMock())
    store.init()
    const logs = new ChatVfsLogService(store)
    const runtimeLike = {
      isVirtualToolCallEnabled: () => true,
      executeBatch: () => {
        throw new Error('boom')
      },
    } as unknown as ChatVfsRuntime
    const handler = new VirtualToolMessageHandler(runtimeLike, logs)
    const output = handler.process({
      chatId: 'chat',
      messageId: 'unhandled',
      messageText: '<virtual-tool-call>{"calls":[{"tool":"list","args":{"path":"/"}}]}</virtual-tool-call>',
    })
    expect(output.handled).toBe(true)
    expect(output.messageText).not.toContain('<virtual-tool-call>')
    expect(output.messageText).toContain('<virtual-tool-result>')
    expect(output.messageText).toContain('UNHANDLED_PROCESSING_ERROR')
  })
})
