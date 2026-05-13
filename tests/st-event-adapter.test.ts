import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMessageController } from '@/app/controllers/message-controller'
import { createMessagePipeline } from '@/app/services/message/message-pipeline'
import { createStMessageEventAdapter } from '@/infra/sillytarvern/events/st-event-adapter'

describe('st message event adapter', () => {
  afterEach(() => {
    vi.resetModules()
    Reflect.deleteProperty(globalThis as Record<string, unknown>, 'SillyTavern')
  })

  function mockStContext() {
    const handlers = new Map<string, Set<(...args: unknown[]) => void>>()
    const on = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      let set = handlers.get(event)
      if (!set) {
        set = new Set()
        handlers.set(event, set)
      }
      set.add(handler)
    })
    const removeListener = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers.get(event)?.delete(handler)
    })

    const context = {
      event_types: {
        MESSAGE_RECEIVED: 'message_received',
        MESSAGE_EDITED: 'message_edited',
        MESSAGE_UPDATED: 'message_updated',
        MESSAGE_DELETED: 'message_deleted',
      },
      eventSource: { on, removeListener },
      extensionSettings: {},
      chatMetadata: {},
      saveSettingsDebounced: vi.fn(),
      saveMetadata: vi.fn(),
    }

    ;(globalThis as Record<string, unknown>).SillyTavern = {
      getContext: () => context,
    }

    return { on, removeListener, context }
  }

  it('start is idempotent: multiple starts register each event only once', () => {
    const { on } = mockStContext()
    const adapter = createStMessageEventAdapter(createMessageController(createMessagePipeline()))

    adapter.start()
    adapter.start()

    expect(on).toHaveBeenCalledTimes(4)
    expect(adapter.isStarted()).toBe(true)
  })

  it('stop removes listeners; restart works', () => {
    const { on, removeListener } = mockStContext()
    const adapter = createStMessageEventAdapter(createMessageController(createMessagePipeline()))

    adapter.start()
    expect(on).toHaveBeenCalledTimes(4)

    adapter.stop()
    expect(removeListener).toHaveBeenCalledTimes(4)
    expect(adapter.isStarted()).toBe(false)

    adapter.start()
    expect(on).toHaveBeenCalledTimes(8)
    expect(adapter.isStarted()).toBe(true)
  })

  it('dedupes MESSAGE_EDITED and MESSAGE_UPDATED when they share the same event name', () => {
    const on = vi.fn()
    const removeListener = vi.fn()
    const ctx = {
      event_types: {
        MESSAGE_RECEIVED: 'message_received',
        MESSAGE_EDITED: 'message_edit_alias',
        MESSAGE_UPDATED: 'message_edit_alias',
        MESSAGE_DELETED: 'message_deleted',
      },
      eventSource: { on, removeListener },
      extensionSettings: {},
      chatMetadata: {},
      saveSettingsDebounced: vi.fn(),
      saveMetadata: vi.fn(),
    }
    ;(globalThis as Record<string, unknown>).SillyTavern = {
      getContext: () => ctx,
    }

    const adapter = createStMessageEventAdapter(createMessageController(createMessagePipeline()))
    adapter.start()

    expect(on).toHaveBeenCalledTimes(3)
  })
})
