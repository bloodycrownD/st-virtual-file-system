import { describe, expect, it } from 'vitest'
import { createVfsPersistenceStore } from '@/app/stores/vfs-persistence-store'
import { ToolDispatcher } from '@/app/services/virtual-tools/tool-dispatcher'
import { ChatVfsRuntime } from '@/app/services/vfs-runtime/chat-vfs-runtime'
import { ChatVfsCheckpointService } from '@/app/services/vfs-checkpoint/chat-vfs-checkpoint-service'
import { ChatVfsLogService } from '@/app/services/vfs-log/chat-vfs-log-service'
import { VirtualToolMessageHandler } from '@/app/services/message/virtual-tool-message-handler'
import { DeflateContentCodec } from '@/infra/serialization/deflate-codec'
import type { StContextAdapter } from '@/infra/persistence/st-context-adapter'

function createAdapterMock(): StContextAdapter {
  let ext: Record<string, unknown> = {}
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

function extractResultJson(messageText: string): Record<string, unknown> {
  const match = messageText.match(/<virtual-tool-result>([\s\S]*?)<\/virtual-tool-result>/)
  if (!match?.[1]) throw new Error('no result tag')
  return JSON.parse(match[1]) as Record<string, unknown>
}

describe('virtual tool result display', () => {
  it('includes full call args in message result when batch fails', () => {
    const store = createVfsPersistenceStore(createAdapterMock())
    store.init()
    const runtime = new ChatVfsRuntime(
      store,
      new ToolDispatcher(),
      new ChatVfsCheckpointService(store, new DeflateContentCodec()),
    )
    const handler = new VirtualToolMessageHandler(runtime, new ChatVfsLogService(store))

    const callJson = JSON.stringify({
      calls: [
        { tool: 'write', args: { path: '/a.txt', content: 'before' } },
        {
          tool: 'replace',
          args: { path: '/a.txt', oldContent: 'missing', newContent: 'after' },
        },
      ],
    })
    const messageText = `<virtual-tool-call>${callJson}</virtual-tool-call>`
    const { messageText: out } = handler.process({
      chatId: 'c1',
      messageId: 'm1',
      messageText,
    })

    const parsed = extractResultJson(out)
    expect(parsed.ok).toBe(false)
    const calls = parsed.calls as Array<{ tool: string; args: Record<string, unknown> }>
    expect(calls[1]?.args).toEqual({ path: '/a.txt', oldContent: 'missing', newContent: 'after' })
  })
})
