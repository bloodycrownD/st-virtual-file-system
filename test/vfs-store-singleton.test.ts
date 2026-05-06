import { afterEach, describe, expect, it, vi } from 'vitest'

describe('vfs store singleton integration', () => {
  afterEach(() => {
    vi.resetModules()
    Reflect.deleteProperty(globalThis as Record<string, unknown>, 'SillyTavern')
  })

  it('subscribes CHAT_CHANGED and reloads chat state when callback fires', async () => {
    let registeredEvent: string | undefined
    let registeredHandler: (() => void) | undefined
    const on = vi.fn((event: string, handler: () => void) => {
      registeredEvent = event
      registeredHandler = handler
    })

    const context = {
      event_types: {
        CHAT_CHANGED: 'chat_changed',
      },
      eventSource: { on },
      extensionSettings: {},
      chatMetadata: {
        'st-virtual-file-system': { mounted: false },
      },
      saveSettingsDebounced: vi.fn(),
      saveMetadata: vi.fn(),
    }

    ;(globalThis as Record<string, unknown>).SillyTavern = {
      getContext: () => context,
    }

    const singletonModule = await import('@/app/stores/vfs-store-singleton')
    singletonModule.initVfsPersistenceStore()

    expect(on).toHaveBeenCalledOnce()
    expect(registeredEvent).toBe('chat_changed')
    expect(singletonModule.vfsPersistenceStore.getState().chat.mounted).toBe(false)

    context.chatMetadata = {
      'st-virtual-file-system': { mounted: true },
    }
    registeredHandler?.()

    expect(singletonModule.vfsPersistenceStore.getState().chat.mounted).toBe(true)
  })
})
