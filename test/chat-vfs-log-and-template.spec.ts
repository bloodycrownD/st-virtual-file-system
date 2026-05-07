import { describe, expect, it } from 'vitest'
import { createVfsPersistenceStore } from '@/app/stores/vfs-persistence-store'
import { ChatVfsLogService } from '@/app/services/vfs-log/chat-vfs-log-service'
import { ChatVfsVersionService } from '@/app/services/vfs-version/chat-vfs-version-service'
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
    const versions = new ChatVfsVersionService(store)
    const templateService = new ExtensionVfsTemplateService(store, versions)
    templateService.initializeChatFromTemplateIfNeeded()
    expect(store.getState().chat.templateInitialized).toBe(true)
    templateService.overwriteChatWithTemplate()
    expect(store.getState().chat.chatVfsVersions.length).toBe(1)
    expect(store.getState().chat.chatVfsVersions[0]?.source).toBe('manual')
  })
})
