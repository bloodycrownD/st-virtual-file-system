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
  it('loads defaults and persists extension state', () => {
    const adapter = createAdapterMock()
    const store = createVfsPersistenceStore(adapter)

    store.init()
    expect(store.getState().extension.enabled).toBe(false)

    store.setExtensionEnabled(true)
    expect(adapter.writeExtensionRaw).toHaveBeenCalledWith({ enabled: true })
    expect(adapter.saveExtension).toHaveBeenCalledOnce()
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
    ;(adapter.readChatRaw as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error('broken metadata')
    })

    const store = createVfsPersistenceStore(adapter)
    store.init()

    expect(store.getState().chat.mounted).toBe(false)
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
