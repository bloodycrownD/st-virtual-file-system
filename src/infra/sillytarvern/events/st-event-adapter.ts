/**
 * SillyTavern「消息相关」事件的订阅适配器：
 * - start：向 eventSource 注册若干 listener，并记住 (eventName, handler) 以便 stop 时成对移除
 * - 幂等：重复 start 不会重复注册
 *
 * CHAT_CHANGED 不在这里注册，避免与 vfs-store-singleton（持久化重载）重复订阅同一事件。
 */
import type { MessageController } from '@/app/controllers/message-controller'

export interface StMessageEventAdapter {
  start: () => void
  stop: () => void
  isStarted: () => boolean
}

/** 单次 start 生命周期内注册的每一对监听，便于 stop 时用 removeListener 精确拆掉 */
type Binding = { event: string; handler: (...args: unknown[]) => void }

/** MESSAGE_EDITED 与 MESSAGE_UPDATED 在不同 ST 版本可能二选一或同值；去重后再 register */
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
        // 同一字符串常量：只触发一次 EDITED，避免重复跑 pipeline
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
