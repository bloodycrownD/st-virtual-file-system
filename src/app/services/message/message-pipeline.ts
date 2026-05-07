/**
 * MessagePipeline（消息业务管道）
 * v2：仅占位桩，真正把「解析 / SQL / 改消息正文」等行为放在后续迭代。
 * 类型里预留 PipelinePhase / PipelineResult，方便以后分阶段报错与观测。
 */
import type { StMessageEventKind } from '@/infra/sillytarvern/events/st-event-types'

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
export function createMessagePipeline(): MessagePipeline {
  return {
    run(input) {
      if (import.meta.env.DEV) {
        console.debug('[st-vfs] message-pipeline (stub)', input.kind, input.args.length)
      }
      return { ok: true, eventKind: input.kind }
    },
  }
}
