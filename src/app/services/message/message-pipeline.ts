/**
 * MessagePipeline（消息业务管道）
 * v2：仅占位桩，真正把「解析 / SQL / 改消息正文」等行为放在后续迭代。
 * 类型里预留 PipelinePhase / PipelineResult，方便以后分阶段报错与观测。
 */
import type { StMessageEventKind } from '@/infra/sillytarvern/events/st-event-types'
import type { VirtualToolMessageHandler } from './virtual-tool-message-handler'

export type PipelinePhase = 'parse' | 'validate' | 'execute' | 'commit'

export interface PipelineResult {
  ok: boolean
  phase?: PipelinePhase
  error?: unknown
  eventKind?: StMessageEventKind
}

export interface MessagePipelineInput {
  kind: StMessageEventKind
  args: unknown[]
}

export interface MessagePipeline {
  run: (input: MessagePipelineInput) => PipelineResult
}

/**
 * v2 stub: no parsing, validation, or persistence. Optional debug trace in dev builds.
 */
export function createMessagePipeline(handler?: VirtualToolMessageHandler): MessagePipeline {
  const processMessage = (input: MessagePipelineInput): PipelineResult => {
    if (!handler) {
      return { ok: true, eventKind: input.kind }
    }
    if (input.kind !== 'MESSAGE_RECEIVED' && input.kind !== 'MESSAGE_EDITED') {
      return { ok: true, eventKind: input.kind }
    }
    if (typeof SillyTavern === 'undefined') {
      return { ok: false, eventKind: input.kind, phase: 'parse', error: new Error('SillyTavern context unavailable') }
    }
    const context = SillyTavern.getContext() as { chat?: Array<Record<string, unknown>>; chatId?: string | number }
    const messageIndex = typeof input.args[0] === 'number' ? input.args[0] : -1
    const chat = Array.isArray(context.chat) ? context.chat : []
    const record = messageIndex >= 0 ? chat[messageIndex] : undefined
    const currentText =
      (record && typeof record.mes === 'string' ? record.mes : undefined) ??
      (record && typeof record.message === 'string' ? record.message : undefined) ??
      (typeof input.args[1] === 'string' ? input.args[1] : undefined)
    if (!currentText) return { ok: true, eventKind: input.kind }
    const chatId = context.chatId ? String(context.chatId) : 'unknown-chat'
    const result = handler.process({
      chatId,
      messageId: String(messageIndex),
      messageText: currentText,
    })
    if (result.handled && record) {
      // Mirror to both keys because ST variants use either `mes` or `message`.
      record.mes = result.messageText
      record.message = result.messageText
    }
    return { ok: true, eventKind: input.kind }
  }

  return {
    run(input) {
      if (import.meta.env.DEV) {
        console.debug('[st-vfs] message-pipeline (stub)', input.kind, input.args.length)
      }
      return processMessage(input)
    },
  }
}
