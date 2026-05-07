/**
 * MessageController：夹在「事件 Adapter」与「Pipeline」中间的薄调度层。
 * 职责只有一件：收到 ST 的回调参数后，按事件种类调用 pipeline.run，并吞掉同步异常，
 * 避免某一个 handler 抛错导致后续消息事件都不再触发。
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

/** 四个方法名将由 st-event-adapter 分别绑定到不同 event_types 字符串上 */
export interface MessageController {
  onMessageReceived: (...args: unknown[]) => void
  onMessageEdited: (...args: unknown[]) => void
  onMessageUpdated: (...args: unknown[]) => void
  onMessageDeleted: (...args: unknown[]) => void
}

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
