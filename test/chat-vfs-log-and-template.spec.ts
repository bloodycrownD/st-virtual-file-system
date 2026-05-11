import { describe, expect, it } from 'vitest'
import { createVfsPersistenceStore } from '@/app/stores/vfs-persistence-store'
import { ChatVfsLogService } from '@/app/services/vfs-log/chat-vfs-log-service'
import { ExtensionVfsTemplateService } from '@/app/services/vfs-runtime/extension-vfs-template-service'
import type { StContextAdapter } from '@/infra/persistence/st-context-adapter'

function createAdapterMock(): StContextAdapter {
  let ext: Record<string, unknown> = { logMaxBytes: 300 }
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

describe('chat vfs logs and templates', () => {
  it('evicts oldest logs when chat exceeds capacity', () => {
    const store = createVfsPersistenceStore(createAdapterMock())
    store.init()
    const logs = new ChatVfsLogService(store)
    for (let i = 0; i < 10; i += 1) {
      logs.append({
        id: `l${i}`,
        timestamp: i,
        chatId: 'c',
        messageId: 'm',
        batchId: 'b',
        toolName: 'write',
        status: 'success',
        durationMs: 1,
        argsSummary: 'x'.repeat(100),
      })
    }
    expect(store.getState().chat.chatVfsLogs.length).toBeLessThan(10)
  })

  it('initializes and overwrites chat snapshot from extension template', () => {
    const store = createVfsPersistenceStore(createAdapterMock())
    store.init()
    store.updateExtension((draft) => ({
      ...draft,
      extensionTemplateVfsSnapshot: {
        schemaVersion: 1,
        rootId: 'root',
        nodes: {
          root: { id: 'root', type: 'directory', path: '/', name: '', parentId: null, children: [], mtime: 1 },
        },
      },
    }))
    store.updateChat((draft) => ({
      ...draft,
      chatVfsLogs: [
        {
          id: 'log-1',
          timestamp: Date.now(),
          chatId: 'c',
          messageId: 'm',
          batchId: 'b',
          toolName: 'write',
          status: 'success',
          durationMs: 1,
          argsSummary: '{}',
        },
      ],
      chatVfsVersions: [{ id: 'v1', time: new Date().toISOString(), operator: 'system', actionType: 'save', scope: '*' }],
    }))
    const templateService = new ExtensionVfsTemplateService(store)
    templateService.initializeChatFromTemplateIfNeeded()
    expect(store.getState().chat.templateInitialized).toBe(true)
    templateService.overwriteChatWithTemplate()
    expect(store.getState().chat.chatVfsLogs).toEqual([])
    expect(store.getState().chat.chatVfsVersions).toEqual([])
  })

  it('clones work-tree config from extension template on first init', () => {
    const store = createVfsPersistenceStore(createAdapterMock())
    store.init()
    store.updateExtension((draft) => ({
      ...draft,
      workTreeTemplate: {
        schemaVersion: 2,
        fileInclusionByPath: { '/selected.md': 'explicit-include' },
        directoryRuleByPath: {
          '/': { sortField: 'name', sortDirection: 'asc', headCount: 2, tailCount: 1, fill: 'filename' },
        },
        directoryRuleEnabledByPath: {},
      },
    }))
    const templateService = new ExtensionVfsTemplateService(store)
    templateService.initializeChatFromTemplateIfNeeded()
    const chatState = store.getState().chat
    expect(chatState.templateInitialized).toBe(true)
    expect(chatState.workTree).not.toBeNull()
    expect(chatState.workTree?.schemaVersion).toBe(2)
    expect(chatState.workTree?.fileInclusionByPath['/selected.md']).toBe('explicit-include')
  })

  it('queries logs by time range', () => {
    const store = createVfsPersistenceStore(createAdapterMock())
    store.init()
    const logs = new ChatVfsLogService(store)
    logs.append({
      id: 'l1',
      timestamp: 100,
      chatId: 'c',
      messageId: 'm1',
      batchId: 'b1',
      toolName: 'write',
      status: 'success',
      durationMs: 1,
      argsSummary: 'a',
    })
    logs.append({
      id: 'l2',
      timestamp: 200,
      chatId: 'c',
      messageId: 'm2',
      batchId: 'b2',
      toolName: 'list',
      status: 'success',
      durationMs: 1,
      argsSummary: 'b',
    })
    logs.append({
      id: 'l3',
      timestamp: 300,
      chatId: 'c',
      messageId: 'm3',
      batchId: 'b3',
      toolName: 'read',
      status: 'success',
      durationMs: 1,
      argsSummary: 'c',
    })

    const inRange = logs.listByTimeRange(150, 250)
    expect(inRange.map((entry) => entry.id)).toEqual(['l2'])
  })
})
