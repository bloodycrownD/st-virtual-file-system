import { describe, expect, it, vi } from 'vitest'
import { createVfsPersistenceStore } from '@/app/stores/vfs-persistence-store'
import type { StContextAdapter } from '@/infra/persistence/st-context-adapter'

function createAdapterMock(): StContextAdapter {
  return {
    readExtensionRaw: vi.fn(() => ({ enabled: false })),
    writeExtensionRaw: vi.fn(),
    saveExtension: vi.fn(),
    readChatRaw: vi.fn(() => ({ mounted: false })),
    writeChatRaw: vi.fn(),
    saveChat: vi.fn(),
  }
}

describe('vfs persistence store', () => {
  it('persists normalized extension/chat defaults during init', () => {
    const adapter = createAdapterMock()
    ;(adapter.readExtensionRaw as ReturnType<typeof vi.fn>).mockReturnValueOnce({ enabled: 'nope' })
    ;(adapter.readChatRaw as ReturnType<typeof vi.fn>).mockReturnValueOnce({})
    const store = createVfsPersistenceStore(adapter)

    store.init()

    expect(adapter.writeExtensionRaw).toHaveBeenCalledWith({
      enabled: true,
      snapshotMaxCount: 10,
      logMaxBytes: 1024 * 1024,
      virtualToolCallEnabled: true,
      virtualToolJsonRepairEnabled: true,
      virtualToolResultFullArgsEnabled: false,
      extensionTemplateVfsSnapshot: null,
      workTreeTemplate: null,
    })
    expect(adapter.saveExtension).toHaveBeenCalledOnce()
    expect(adapter.writeChatRaw).toHaveBeenCalled()
    const writtenChat = (adapter.writeChatRaw as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Record<
      string,
      unknown
    >
    expect(writtenChat).toMatchObject({
      mounted: false,
      chatVfsLogs: [],
      vfsCheckpoints: [],
      vfsPathVersionStore: {},
      vfsChatPersistenceVersion: 2,
      templateInitialized: false,
      workTree: null,
    })
    expect((writtenChat.chatVfsSnapshot as Record<string, unknown>).rootId).toBe('root')
    expect(adapter.saveChat).toHaveBeenCalledOnce()
  })

  it('loads defaults and persists extension state', () => {
    const adapter = createAdapterMock()
    const store = createVfsPersistenceStore(adapter)

    store.init()
    expect(store.getState().extension.enabled).toBe(false)

    store.setExtensionEnabled(true)
    expect(adapter.writeExtensionRaw).toHaveBeenCalledWith({
      enabled: true,
      snapshotMaxCount: 10,
      logMaxBytes: 1024 * 1024,
      virtualToolCallEnabled: true,
      virtualToolJsonRepairEnabled: true,
      virtualToolResultFullArgsEnabled: false,
      extensionTemplateVfsSnapshot: null,
      workTreeTemplate: null,
    })
    expect(adapter.saveExtension).toHaveBeenCalledTimes(2)
  })

  it('reloads chat state on chat change and notifies subscribers', () => {
    const adapter = createAdapterMock()
    const store = createVfsPersistenceStore(adapter)
    const subscriber = vi.fn()
    const nextChatRaw = { mounted: true }

    store.subscribe(subscriber)
    store.init()
    ;(adapter.readChatRaw as ReturnType<typeof vi.fn>).mockReturnValueOnce(nextChatRaw)

    store.reloadChatState()
    expect(store.getState().chat.mounted).toBe(true)
    expect(subscriber).toHaveBeenCalled()
  })

  it('falls back to defaults when adapter throws on read', () => {
    const adapter = createAdapterMock()
    ;(adapter.readExtensionRaw as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error('broken extension settings')
    })
    ;(adapter.readChatRaw as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error('broken metadata')
    })

    const store = createVfsPersistenceStore(adapter)
    store.init()

    expect(store.getState().extension.enabled).toBe(true)
    expect(store.getState().chat.mounted).toBe(false)
    expect(adapter.writeExtensionRaw).toHaveBeenCalledWith({
      enabled: true,
      snapshotMaxCount: 10,
      logMaxBytes: 1024 * 1024,
      virtualToolCallEnabled: true,
      virtualToolJsonRepairEnabled: true,
      virtualToolResultFullArgsEnabled: false,
      extensionTemplateVfsSnapshot: null,
      workTreeTemplate: null,
    })
    expect(adapter.saveExtension).toHaveBeenCalledOnce()
    expect(adapter.writeChatRaw).toHaveBeenCalled()
    const writtenChat = (adapter.writeChatRaw as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Record<
      string,
      unknown
    >
    expect(writtenChat).toMatchObject({
      mounted: false,
      chatVfsLogs: [],
      vfsCheckpoints: [],
      vfsPathVersionStore: {},
      vfsChatPersistenceVersion: 2,
      templateInitialized: false,
      workTree: null,
    })
    expect((writtenChat.chatVfsSnapshot as Record<string, unknown>).rootId).toBe('root')
    expect(adapter.saveChat).toHaveBeenCalledOnce()
  })

  it('returns immutable snapshots from getState', () => {
    const adapter = createAdapterMock()
    const store = createVfsPersistenceStore(adapter)
    store.init()

    const leaked = store.getState()
    ;(leaked.chat as { mounted: boolean }).mounted = true

    expect(store.getState().chat.mounted).toBe(false)
  })
})
