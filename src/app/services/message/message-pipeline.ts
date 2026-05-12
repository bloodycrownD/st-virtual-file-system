/**
 * @module message-pipeline
 *
 * Message pipeline entrypoint for `st-virtual-file-system`.
 *
 * This file currently provides a small **v2 stub** pipeline that can be integrated with SillyTavern message
 * events. The stub is intentionally conservative: it only delegates to `VirtualToolMessageHandler` when it is
 * safe to do so, and otherwise returns success without mutating any message data.
 *
 * ## Current behavior (v2 stub)
 *
 * - No parsing/validation/persistence stages are implemented yet beyond basic gating.
 * - Message events that can carry user-visible text delegate to the virtual-tool handler:
 *   `MESSAGE_RECEIVED` / `MESSAGE_EDITED` / `MESSAGE_UPDATED` (ST may emit either edit flavor on save).
 * - When a handler is provided, the pipeline reads the current message text from the SillyTavern context and
 *   lets the handler decide whether to update it (typically by replacing a `<virtual-tool-call>` with a
 *   `<virtual-tool-result>`).
 *
 * ## Future extension points
 *
 * `PipelinePhase` and `PipelineResult` are structured to support phased error reporting/observability once
 * additional stages (parse/validate/execute/commit) are implemented.
 */
import type { StMessageEventKind } from '@/infra/sillytarvern/events/st-event-types'
import type { VirtualToolMessageHandler } from './virtual-tool-message-handler'

/** Named pipeline stages for future phased execution/telemetry. */
export type PipelinePhase = 'parse' | 'validate' | 'execute' | 'commit'

/**
 * Result of running the pipeline.
 *
 * The stub implementation always returns `ok=true` unless the SillyTavern context is unavailable at runtime.
 * In future iterations, `phase` and `error` can be used to pinpoint where failures occur.
 */
export interface PipelineResult {
  ok: boolean
  phase?: PipelinePhase
  error?: unknown
  eventKind?: StMessageEventKind
}

/** Input envelope passed from the SillyTavern event hook. */
export interface MessagePipelineInput {
  kind: StMessageEventKind
  args: unknown[]
}

/** Minimal pipeline interface used by extension wiring code. */
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
    // WHY: ST "save edited message" may dispatch `MESSAGE_UPDATED` without `MESSAGE_EDITED`; skipping it breaks virtual tools until reload.
    if (
      input.kind !== 'MESSAGE_RECEIVED' &&
      input.kind !== 'MESSAGE_EDITED' &&
      input.kind !== 'MESSAGE_UPDATED'
    ) {
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
    /**
     * Runs the pipeline for a single SillyTavern event.
     *
     * This is a synchronous stub by design. Any heavy lifting (virtual tool parsing/execution and idempotent
     * tag replacement) is delegated to `VirtualToolMessageHandler`.
     */
    run(input) {
      if (import.meta.env.DEV) {
        console.debug('[st-vfs] message-pipeline (stub)', input.kind, input.args.length)
      }
      return processMessage(input)
    },
  }
}
