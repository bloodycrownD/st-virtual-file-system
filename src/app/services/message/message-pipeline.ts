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
