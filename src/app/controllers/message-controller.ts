import type { MessagePipeline } from '@/app/services/message/message-pipeline'
import type { StMessageEventKind } from '@/infra/sillytarvern/events/st-event-types'

function logDispatchError(kind: StMessageEventKind, err: unknown) {
  const wrapped = err instanceof Error ? err : new Error(String(err))
  console.error(`[st-vfs] message-controller: ${kind}`, wrapped)
}

export interface MessageController {
  onMessageReceived: (...args: unknown[]) => void
  onMessageEdited: (...args: unknown[]) => void
  onMessageUpdated: (...args: unknown[]) => void
  onMessageDeleted: (...args: unknown[]) => void
}

export function createMessageController(pipeline: MessagePipeline): MessageController {
  const dispatch = (kind: StMessageEventKind, args: unknown[]) => {
    try {
      pipeline.run({ kind, args })
    } catch (err) {
      logDispatchError(kind, err)
    }
  }

  return {
    onMessageReceived: (...args: unknown[]) => dispatch('MESSAGE_RECEIVED', args),
    onMessageEdited: (...args: unknown[]) => dispatch('MESSAGE_EDITED', args),
    onMessageUpdated: (...args: unknown[]) => dispatch('MESSAGE_UPDATED', args),
    onMessageDeleted: (...args: unknown[]) => dispatch('MESSAGE_DELETED', args),
  }
}
