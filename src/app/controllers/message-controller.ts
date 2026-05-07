/**
 * @file Message dispatch façade between SillyTavern events and the internal pipeline.
 *
 * `MessageController` is intentionally thin:
 * - It receives raw callback arguments from SillyTavern event listeners.
 * - It forwards them to `MessagePipeline.run()` together with a logical event kind.
 * - It catches synchronous exceptions to avoid breaking SillyTavern's event emitter chain
 *   (a thrown error in one listener can prevent subsequent events from being delivered).
 *
 * The controller does **not** interpret SillyTavern's event argument shapes; those vary by
 * version and event type, so the pipeline receives the original `unknown[]` unchanged.
 */
import type { MessagePipeline } from '@/app/services/message/message-pipeline'
import type { StMessageEventKind } from '@/infra/sillytarvern/events/st-event-types'

function logDispatchError(kind: StMessageEventKind, args: unknown[], err: unknown) {
  const wrapped = err instanceof Error ? err : new Error(String(err))
  const phase = 'pipeline.run'
  const messageIndex = typeof args[0] === 'number' ? args[0] : undefined
  console.error(
    `[st-vfs] message-controller: kind=${kind} phase=${phase} messageIndex=${messageIndex ?? 'n/a'}`,
    wrapped,
  )
}

/**
 * A stable, version-agnostic surface for the event adapter to call.
 *
 * The adapter binds these methods to SillyTavern's `event_types.*` string constants at runtime.
 * Each handler keeps the original callback arguments intact (`unknown[]`) to preserve compatibility
 * across SillyTavern versions.
 */
export interface MessageController {
  onMessageReceived: (...args: unknown[]) => void
  onMessageEdited: (...args: unknown[]) => void
  onMessageUpdated: (...args: unknown[]) => void
  onMessageDeleted: (...args: unknown[]) => void
}

/**
 * Creates a `MessageController` bound to a pipeline.
 *
 * @param pipeline - The internal pipeline that handles the event routing and side effects.
 * @returns A controller whose methods can be registered as SillyTavern event listeners.
 */
export function createMessageController(pipeline: MessagePipeline): MessageController {
  /** 统一入口：附带 kind + 原始参数数组传递给 pipeline（ST 各事件签名可能不同） */
  const dispatch = (kind: StMessageEventKind, args: unknown[]) => {
    try {
      pipeline.run({ kind, args })
    } catch (err) {
      logDispatchError(kind, args, err)
    }
  }

  return {
    onMessageReceived: (...args: unknown[]) => dispatch('MESSAGE_RECEIVED', args),
    onMessageEdited: (...args: unknown[]) => dispatch('MESSAGE_EDITED', args),
    onMessageUpdated: (...args: unknown[]) => dispatch('MESSAGE_UPDATED', args),
    onMessageDeleted: (...args: unknown[]) => dispatch('MESSAGE_DELETED', args),
  }
}
