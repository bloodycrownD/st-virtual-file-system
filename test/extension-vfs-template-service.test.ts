import { describe, expect, it } from 'vitest'
import { ExtensionVfsTemplateService } from '@/app/services/vfs-runtime/extension-vfs-template-service'
import { createEmptyVfsSnapshot } from '@/infra/persistence/vfs-snapshot.schema'
import type { VfsPersistenceStore, VfsPersistenceState } from '@/app/stores/vfs-persistence-store'

function createStore(initialState?: Partial<VfsPersistenceState>): VfsPersistenceStore {
  let state: VfsPersistenceState = {
    extension: {
      enabled: true,
      logMaxBytes: 1024 * 1024,
      virtualToolCallEnabled: true,
      extensionTemplateVfsSnapshot: null,
      workTreeTemplate: null,
    },
    chat: {
      mounted: false,
      chatVfsSnapshot: createEmptyVfsSnapshot(),
      chatVfsLogs: [],
      chatVfsVersions: [],
      templateInitialized: false,
      workTree: null,
    },
  }
  state = {
    extension: { ...state.extension, ...(initialState?.extension ?? {}) },
    chat: { ...state.chat, ...(initialState?.chat ?? {}) },
  }
  return {
    init: () => {},
    reloadChatState: () => {},
    setExtensionEnabled: () => {},
    setChatMounted: () => {},
    subscribe: () => () => {},
    getState: () => ({ extension: { ...state.extension }, chat: { ...state.chat } }),
    updateExtension: (updater) => {
      state = { ...state, extension: updater({ ...state.extension }) }
    },
    updateChat: (updater) => {
      state = { ...state, chat: updater({ ...state.chat, chatVfsLogs: [...state.chat.chatVfsLogs], chatVfsVersions: [...state.chat.chatVfsVersions] }) }
    },
  }
}

describe('extension vfs template service', () => {
  it('initializes chat with empty snapshot when template is missing', () => {
    const store = createStore({
      extension: { extensionTemplateVfsSnapshot: null },
      chat: { templateInitialized: false },
    })
    const service = new ExtensionVfsTemplateService(store)

    service.initializeChatFromTemplateIfNeeded()

    const chat = store.getState().chat
    expect(chat.templateInitialized).toBe(true)
    expect(chat.chatVfsSnapshot.rootId).toBe('root')
    expect(chat.chatVfsSnapshot.nodes.root?.path).toBe('/')
    expect(chat.chatVfsSnapshot.nodes.root?.type).toBe('directory')
  })

  it('initializes chat from template with deep-cloned snapshot', () => {
    const template = createEmptyVfsSnapshot()
    const store = createStore({
      extension: { extensionTemplateVfsSnapshot: template },
      chat: { templateInitialized: false },
    })
    const service = new ExtensionVfsTemplateService(store)

    service.initializeChatFromTemplateIfNeeded()

    const initialized = store.getState().chat.chatVfsSnapshot
    expect(store.getState().chat.templateInitialized).toBe(true)
    expect(initialized).toEqual(template)
    expect(initialized).not.toBe(template)
  })

  it('overwrites chat from template and clears logs/version history', () => {
    const template = createEmptyVfsSnapshot()
    const store = createStore({
      extension: { extensionTemplateVfsSnapshot: template },
      chat: {
        chatVfsLogs: [
          {
            id: 'l1',
            timestamp: Date.now(),
            chatId: 'c1',
            messageId: 'm1',
            batchId: 'b1',
            toolName: 'tool',
            status: 'success',
            durationMs: 1,
            argsSummary: '{}',
          },
        ],
        chatVfsVersions: [{ id: 'v1', time: new Date().toISOString(), operator: 'system', actionType: 'save', scope: '*' }],
      },
    })
    const service = new ExtensionVfsTemplateService(store)

    service.overwriteChatWithTemplate()

    const chat = store.getState().chat
    expect(chat.chatVfsSnapshot).toEqual(template)
    expect(chat.chatVfsSnapshot).not.toBe(template)
    expect(chat.chatVfsLogs).toEqual([])
    expect(chat.chatVfsVersions).toEqual([])
    expect(chat.templateInitialized).toBe(true)
  })
})
