import { describe, expect, it } from 'vitest'
import { ExtensionVfsTemplateService } from '@/app/services/vfs-runtime/extension-vfs-template-service'
import { createEmptyVfsSnapshot } from '@/infra/persistence/vfs-snapshot.schema'
import type { VfsPersistenceStore, VfsPersistenceState } from '@/app/stores/vfs-persistence-store'

function createStore(initialState?: Partial<VfsPersistenceState>): VfsPersistenceStore {
  let state: VfsPersistenceState = {
    extension: {
      enabled: true,
      snapshotMaxCount: 10,
      logMaxBytes: 1024 * 1024,
      virtualToolCallEnabled: true,
      extensionTemplateVfsSnapshot: null,
      workTreeTemplate: null,
    },
    chat: {
      vfsChatPersistenceVersion: 2,
      mounted: false,
      chatVfsSnapshot: createEmptyVfsSnapshot(),
      chatVfsLogs: [],
      vfsPathVersionStore: {},
      vfsCheckpoints: [],
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
      state = {
        ...state,
        chat: updater({
          ...state.chat,
          chatVfsLogs: [...state.chat.chatVfsLogs],
          vfsPathVersionStore: { ...state.chat.vfsPathVersionStore },
          vfsCheckpoints: [...state.chat.vfsCheckpoints],
        }),
      }
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

  it('overwrites chat from template and clears logs and checkpoint history', () => {
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
        vfsPathVersionStore: {
          '/x.txt': [
            {
              versionId: 'pv-1',
              kind: 'file' as const,
              createdAt: new Date().toISOString(),
              content: { encoding: 'plain' as const, data: 'x', originalSize: 1 },
              updatedBy: 'user' as const,
            },
          ],
        },
        vfsCheckpoints: [
          {
            id: 'c1',
            time: new Date().toISOString(),
            source: 'editor-save' as const,
            treeVersion: { '/x.txt': 'pv-1' },
          },
        ],
      },
    })
    const service = new ExtensionVfsTemplateService(store)

    service.overwriteChatWithTemplate()

    const chat = store.getState().chat
    expect(chat.chatVfsSnapshot).toEqual(template)
    expect(chat.chatVfsSnapshot).not.toBe(template)
    expect(chat.chatVfsLogs).toEqual([])
    expect(chat.vfsCheckpoints).toEqual([])
    expect(chat.vfsPathVersionStore).toEqual({})
    expect(chat.templateInitialized).toBe(true)
  })
})
