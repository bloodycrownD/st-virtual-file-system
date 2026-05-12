import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMessagePipeline } from '@/app/services/message/message-pipeline'
import type { VirtualToolMessageHandler } from '@/app/services/message/virtual-tool-message-handler'

describe('message-pipeline virtual-tool delegation', () => {
  const originalSillyTavern = (globalThis as { SillyTavern?: unknown }).SillyTavern

  afterEach(() => {
    if (originalSillyTavern !== undefined) {
      ;(globalThis as { SillyTavern?: unknown }).SillyTavern = originalSillyTavern
    } else {
      delete (globalThis as { SillyTavern?: unknown }).SillyTavern
    }
  })

  it('invokes handler.process for MESSAGE_UPDATED', () => {
    const process = vi.fn(() => ({ handled: false, messageText: 'x' }))
    const handler = { process } as unknown as VirtualToolMessageHandler
    const pipeline = createMessagePipeline(handler)
    ;(globalThis as { SillyTavern: { getContext: () => unknown } }).SillyTavern = {
      getContext: () => ({
        chatId: 'chat-1',
        chat: [{ mes: '<virtual-tool-call>{}</virtual-tool-call>' }],
      }),
    }
    pipeline.run({ kind: 'MESSAGE_UPDATED', args: [0] })
    expect(process).toHaveBeenCalledTimes(1)
  })

  it('does not invoke handler.process for MESSAGE_DELETED', () => {
    const process = vi.fn()
    const handler = { process } as unknown as VirtualToolMessageHandler
    const pipeline = createMessagePipeline(handler)
    ;(globalThis as { SillyTavern: { getContext: () => unknown } }).SillyTavern = {
      getContext: () => ({
        chatId: 'chat-1',
        chat: [{ mes: 'hello' }],
      }),
    }
    pipeline.run({ kind: 'MESSAGE_DELETED', args: [0] })
    expect(process).not.toHaveBeenCalled()
  })
})
