import { describe, expect, it } from 'vitest'
import { createVfsPersistenceStore } from '@/app/stores/vfs-persistence-store'
import { ToolDispatcher } from '@/app/services/virtual-tools/tool-dispatcher'
import { ChatVfsRuntime } from '@/app/services/vfs-runtime/chat-vfs-runtime'
import { ChatVfsCheckpointService } from '@/app/services/vfs-checkpoint/chat-vfs-checkpoint-service'
import { ChatVfsLogService } from '@/app/services/vfs-log/chat-vfs-log-service'
import { VirtualToolMessageHandler } from '@/app/services/message/virtual-tool-message-handler'
import { parseVirtualToolEnvelope } from '@/app/services/message/virtual-tool-call-parser'
import { assessRepairability } from '@/app/services/message/json-repair-policy'
import { DeflateContentCodec } from '@/infra/serialization/deflate-codec'
import type { StContextAdapter } from '@/infra/persistence/st-context-adapter'

function createAdapterMock(extensionSeed: Record<string, unknown> = {}): StContextAdapter {
  let ext: Record<string, unknown> = extensionSeed
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

function createHandler(store: ReturnType<typeof createVfsPersistenceStore>) {
  const runtime = new ChatVfsRuntime(
    store,
    new ToolDispatcher(),
    new ChatVfsCheckpointService(store, new DeflateContentCodec()),
  )
  const logs = new ChatVfsLogService(store)
  const handler = new VirtualToolMessageHandler(
    runtime,
    logs,
    () => store.getState().extension.virtualToolJsonRepairEnabled,
  )
  return { handler, runtime, store }
}

function extractResultJson(messageText: string): Record<string, unknown> {
  const match = messageText.match(/<virtual-tool-result>([\s\S]*?)<\/virtual-tool-result>/)
  if (!match?.[1]) throw new Error('no result tag')
  return JSON.parse(match[1]) as Record<string, unknown>
}

describe('json-repair-policy', () => {
  it('allows missing structural closers', () => {
    expect(assessRepairability('{"calls":[{"tool":"list","args":{"path":"/"}}]').allowed).toBe(true)
  })

  it('allows trailing comma patterns', () => {
    expect(assessRepairability('{"calls":[{"tool":"list","args":{"path":"/"}},]}').allowed).toBe(true)
  })

  it('rejects unterminated strings', () => {
    const assessment = assessRepairability(
      '{"calls":[{"tool":"write","args":{"path":"/a.txt","content":"hello',
    )
    expect(assessment.allowed).toBe(false)
    expect(assessment.reasonCode).toBe('LIKELY_TRUNCATED_PAYLOAD')
  })
})

describe('virtual-tool-call-parser', () => {
  it('parses valid JSON as parsed', () => {
    const result = parseVirtualToolEnvelope('{"calls":[{"tool":"list","args":{"path":"/"}}]}', {
      repairEnabled: true,
    })
    expect(result.kind).toBe('parsed')
  })

  it('repairs missing closing brace when enabled', () => {
    const result = parseVirtualToolEnvelope('{"calls":[{"tool":"list","args":{"path":"/"}}]', {
      repairEnabled: true,
    })
    expect(result.kind).toBe('repaired')
    if (result.kind === 'repaired') {
      expect(result.envelope.calls[0]?.tool).toBe('list')
    }
  })

  it('returns strict-failed when repair disabled', () => {
    const result = parseVirtualToolEnvelope('{"calls":[{"tool":"list","args":{"path":"/"}}]', {
      repairEnabled: false,
    })
    expect(result.kind).toBe('strict-failed')
  })

  it('returns non-repairable for unterminated content string', () => {
    const result = parseVirtualToolEnvelope(
      '{"calls":[{"tool":"write","args":{"path":"/a.txt","content":"hello',
      { repairEnabled: true },
    )
    expect(result.kind).toBe('non-repairable')
    if (result.kind === 'non-repairable') {
      expect(result.reasonCode).toBe('LIKELY_TRUNCATED_PAYLOAD')
    }
  })
})

describe('virtual tool JSON repair (handler)', () => {
  it('missing_closing_brace_should_repair_and_execute_when_toggle_on', () => {
    const store = createVfsPersistenceStore(createAdapterMock())
    store.init()
    const { handler } = createHandler(store)
    const output = handler.process({
      chatId: 'chat',
      messageId: 'repair-brace',
      messageText: '<virtual-tool-call>{"calls":[{"tool":"list","args":{"path":"/"}}]</virtual-tool-call>',
    })
    expect(output.handled).toBe(true)
    expect(output.messageText).toContain('<virtual-tool-result>')
    expect(output.messageText).not.toContain('<virtual-tool-call>')
  })

  it('trailing_comma_should_repair_and_execute_when_toggle_on', () => {
    const store = createVfsPersistenceStore(createAdapterMock())
    store.init()
    const { handler } = createHandler(store)
    const output = handler.process({
      chatId: 'chat',
      messageId: 'repair-comma',
      messageText:
        '<virtual-tool-call>{"calls":[{"tool":"list","args":{"path":"/"}},]}</virtual-tool-call>',
    })
    expect(output.handled).toBe(true)
    expect(output.messageText).toContain('<virtual-tool-result>')
  })

  it('unterminated_string_should_skip_and_keep_call_when_toggle_on', () => {
    const store = createVfsPersistenceStore(createAdapterMock())
    store.init()
    const { handler } = createHandler(store)
    const before = JSON.stringify(store.getState().chat.chatVfsSnapshot)
    const messageText =
      '<virtual-tool-call>{"calls":[{"tool":"write","args":{"path":"/a.txt","content":"hello</virtual-tool-call>'
    const output = handler.process({
      chatId: 'chat',
      messageId: 'no-repair-string',
      messageText,
    })
    expect(output.handled).toBe(false)
    expect(output.messageText).toBe(messageText)
    expect(output.messageText).toContain('<virtual-tool-call>')
    expect(output.messageText).not.toContain('<virtual-tool-result>')
    expect(JSON.stringify(store.getState().chat.chatVfsSnapshot)).toBe(before)
  })

  it('malformed_json_should_keep_call_when_toggle_off', () => {
    const store = createVfsPersistenceStore(
      createAdapterMock({ virtualToolJsonRepairEnabled: false }),
    )
    store.init()
    const { handler } = createHandler(store)
    const messageText = '<virtual-tool-call>{"calls":[{"tool":"list","args":{"path":"/"}}]</virtual-tool-call>'
    const output = handler.process({
      chatId: 'chat',
      messageId: 'toggle-off',
      messageText,
    })
    expect(output.handled).toBe(false)
    expect(output.messageText).toBe(messageText)
  })

  it('repair_success_should_emit_repair_audit_marker', () => {
    const store = createVfsPersistenceStore(createAdapterMock())
    store.init()
    const { handler } = createHandler(store)
    const output = handler.process({
      chatId: 'chat',
      messageId: 'audit',
      messageText: '<virtual-tool-call>{"calls":[{"tool":"list","args":{"path":"/"}}]</virtual-tool-call>',
    })
    const result = extractResultJson(output.messageText)
    expect(result.repairApplied).toBe(true)
    expect(Array.isArray(result.repairNotes)).toBe(true)
    const logs = store.getState().chat.chatVfsLogs
    expect(logs.some((e) => e.errorCode === 'JSON_REPAIRED')).toBe(true)
  })

  it('function_calling_path_should_not_use_repair_logic', () => {
    const store = createVfsPersistenceStore(createAdapterMock())
    store.init()
    const runtime = new ChatVfsRuntime(
      store,
      new ToolDispatcher(),
      new ChatVfsCheckpointService(store, new DeflateContentCodec()),
    )
    const result = runtime.executeSingleTool('list', { path: '/' })
    expect(result.ok).toBe(true)
    expect(parseVirtualToolEnvelope('{"calls":[{"tool":"list","args":{"path":"/"}}]', { repairEnabled: false }).kind).toBe(
      'strict-failed',
    )
  })
})
