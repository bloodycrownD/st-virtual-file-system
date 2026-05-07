import { extractLastCallBlock, replaceCallWithResult, validateSingleResultTag } from './virtual-tool-tag-manager'
import type { ToolCallEnvelope } from '@/app/services/virtual-tools/tool-contracts'
import type { ChatVfsRuntime } from '@/app/services/vfs-runtime/chat-vfs-runtime'
import type { ChatVfsLogService } from '@/app/services/vfs-log/chat-vfs-log-service'

const locks = new Set<string>()

function summarizeArgs(args: Record<string, unknown>): string {
  const keys = Object.keys(args)
  return keys.slice(0, 4).join(',')
}

export class VirtualToolMessageHandler {
  constructor(
    private readonly runtime: ChatVfsRuntime,
    private readonly logs: ChatVfsLogService,
  ) {}

  process(input: { chatId: string; messageId: string; messageText: string }): { handled: boolean; messageText: string } {
    const lockKey = `${input.chatId}:${input.messageId}`
    if (locks.has(lockKey)) return { handled: false, messageText: input.messageText }
    locks.add(lockKey)
    const startedAt = Date.now()
    let callBlock = extractLastCallBlock(input.messageText)
    try {
      if (!this.runtime.isVirtualToolCallEnabled()) {
        return { handled: false, messageText: input.messageText }
      }
      const resultTag = validateSingleResultTag(input.messageText)
      if (!resultTag.ok) {
        this.logs.append({
          id: `log-${Date.now()}`,
          timestamp: Date.now(),
          chatId: input.chatId,
          messageId: input.messageId,
          batchId: `batch-${Date.now()}`,
          toolName: 'batch',
          status: 'failed',
          durationMs: Date.now() - startedAt,
          argsSummary: 'result-tag-validation',
          errorCode: 'MULTIPLE_RESULT_TAGS',
          errorMessage: `Found ${resultTag.count} result tags`,
        })
        return { handled: false, messageText: input.messageText }
      }
      if (!callBlock || !callBlock.content) return { handled: false, messageText: input.messageText }
      let envelope: ToolCallEnvelope
      try {
        envelope = JSON.parse(callBlock.content) as ToolCallEnvelope
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        this.logs.append({
          id: `log-${Date.now()}`,
          timestamp: Date.now(),
          chatId: input.chatId,
          messageId: input.messageId,
          batchId: `batch-${Date.now()}`,
          toolName: 'batch',
          status: 'failed',
          durationMs: Date.now() - startedAt,
          argsSummary: 'parse',
          errorCode: 'INVALID_JSON',
          errorMessage,
        })
        return {
          handled: true,
          messageText: replaceCallWithResult(input.messageText, callBlock, {
            ok: false,
            calls: [],
            results: [],
            errorCode: 'INVALID_JSON',
            errorMessage,
          }),
        }
      }
      const batch = this.runtime.executeBatch(envelope)
      const payload = {
        ok: batch.ok,
        calls: envelope.calls.map((call) => ({ tool: call.tool, argsSummary: summarizeArgs(call.args ?? {}) })),
        results: batch.results,
        errorCode: batch.errorCode,
        errorMessage: batch.errorMessage,
      }
      this.logs.append({
        id: `log-${Date.now()}`,
        timestamp: Date.now(),
        chatId: input.chatId,
        messageId: input.messageId,
        batchId: `batch-${Date.now()}`,
        toolName: 'batch',
        status: batch.ok ? 'success' : batch.errorCode === 'BATCH_TIMEOUT' ? 'timeout' : 'failed',
        durationMs: Date.now() - startedAt,
        argsSummary: `calls=${envelope.calls.length}`,
        errorCode: batch.errorCode,
        errorMessage: batch.errorMessage,
      })
      this.logPerToolExecution(input, envelope, batch)
      return { handled: true, messageText: replaceCallWithResult(input.messageText, callBlock, payload) }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const unexpectedCode = 'UNHANDLED_PROCESSING_ERROR'
      if (!callBlock) {
        callBlock = extractLastCallBlock(input.messageText)
      }
      this.logs.append({
        id: `log-${Date.now()}`,
        timestamp: Date.now(),
        chatId: input.chatId,
        messageId: input.messageId,
        batchId: `batch-${Date.now()}`,
        toolName: 'batch',
        status: 'failed',
        durationMs: Date.now() - startedAt,
        argsSummary: 'unhandled',
        errorCode: unexpectedCode,
        errorMessage,
      })
      if (callBlock) {
        return {
          handled: true,
          messageText: replaceCallWithResult(input.messageText, callBlock, {
            ok: false,
            calls: [],
            results: [],
            errorCode: unexpectedCode,
            errorMessage,
          }),
        }
      }
      const hasCallTag = input.messageText.includes('<virtual-tool-call>')
      return { handled: hasCallTag, messageText: input.messageText }
    } finally {
      locks.delete(lockKey)
    }
  }

  private logPerToolExecution(
    input: { chatId: string; messageId: string },
    envelope: ToolCallEnvelope,
    batch: { ok: boolean; results: Array<{ tool: string; data?: unknown }>; errorCode?: string; errorMessage?: string },
  ): void {
    const now = Date.now()
    envelope.calls.forEach((call, index) => {
      const result = batch.results[index]
      if (result) {
        this.logs.append({
          id: `log-${now}-${index}`,
          timestamp: now,
          chatId: input.chatId,
          messageId: input.messageId,
          batchId: `batch-${now}`,
          toolName: result.tool,
          status: 'success',
          durationMs: 0,
          argsSummary: summarizeArgs(call.args ?? {}),
        })
        const maybeReadData = result.tool === 'read' && result.data && typeof result.data === 'object' ? result.data : null
        const truncated =
          maybeReadData && 'truncated' in maybeReadData && (maybeReadData as { truncated: unknown }).truncated === true
        if (truncated) {
          this.logs.append({
            id: `log-${now}-${index}-truncated`,
            timestamp: now,
            chatId: input.chatId,
            messageId: input.messageId,
            batchId: `batch-${now}`,
            toolName: result.tool,
            status: 'success',
            durationMs: 0,
            argsSummary: 'read-truncated',
            errorCode: 'READ_TRUNCATED',
            errorMessage: 'Read output truncated by hard caps',
          })
        }
        return
      }
      if (index === batch.results.length && !batch.ok) {
        this.logs.append({
          id: `log-${now}-${index}`,
          timestamp: now,
          chatId: input.chatId,
          messageId: input.messageId,
          batchId: `batch-${now}`,
          toolName: call.tool,
          status: batch.errorCode === 'BATCH_TIMEOUT' ? 'timeout' : 'failed',
          durationMs: 0,
          argsSummary: summarizeArgs(call.args ?? {}),
          errorCode: batch.errorCode,
          errorMessage: batch.errorMessage,
        })
      }
    })
  }
}
