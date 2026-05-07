import type { MessageController } from '@/app/controllers/message-controller'

export interface StMessageEventAdapter {
  start: () => void
  stop: () => void
  isStarted: () => boolean
}

type Binding = { event: string; handler: (...args: unknown[]) => void }

function collectUniqueEventNames(...candidates: (string | undefined)[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const c of candidates) {
    if (typeof c === 'string' && c.length > 0 && !seen.has(c)) {
      seen.add(c)
      out.push(c)
    }
  }
  return out
}

/**
 * Subscribes SillyTavern message events only. `CHAT_CHANGED` remains handled in
 * `vfs-store-singleton` (persistence reload); this adapter does not register it.
 */
export function createStMessageEventAdapter(controller: MessageController): StMessageEventAdapter {
  let started = false
  const bindings: Binding[] = []

  const start = () => {
    if (started) {
      return
    }
    if (typeof SillyTavern === 'undefined') {
      return
    }

    const { eventSource, event_types: et } = SillyTavern.getContext()

    const onMessageDeleted = (...args: unknown[]) => controller.onMessageDeleted(...args)

    const register = (event: string, handler: (...args: unknown[]) => void) => {
      eventSource.on(event, handler)
      bindings.push({ event, handler })
    }

    if (typeof et.MESSAGE_RECEIVED === 'string' && et.MESSAGE_RECEIVED) {
      register(et.MESSAGE_RECEIVED, (...args: unknown[]) => controller.onMessageReceived(...args))
    }

    for (const event of collectUniqueEventNames(et.MESSAGE_EDITED, et.MESSAGE_UPDATED)) {
      const handler = (...args: unknown[]) => {
        if (et.MESSAGE_EDITED === et.MESSAGE_UPDATED) {
          controller.onMessageEdited(...args)
          return
        }
        if (event === et.MESSAGE_EDITED) {
          controller.onMessageEdited(...args)
        } else if (event === et.MESSAGE_UPDATED) {
          controller.onMessageUpdated(...args)
        }
      }
      register(event, handler)
    }

    if (typeof et.MESSAGE_DELETED === 'string' && et.MESSAGE_DELETED) {
      register(et.MESSAGE_DELETED, onMessageDeleted)
    }

    started = true
  }

  const stop = () => {
    if (!started) {
      return
    }
    if (typeof SillyTavern !== 'undefined') {
      const { eventSource } = SillyTavern.getContext()
      for (const { event, handler } of bindings) {
        eventSource.removeListener(event, handler)
      }
    }
    bindings.length = 0
    started = false
  }

  return {
    start,
    stop,
    isStarted: () => started,
  }
}
