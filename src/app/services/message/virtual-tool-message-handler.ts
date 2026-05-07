/**
 * @module virtual-tool-message-handler
 *
 * Message-level orchestrator for executing virtual tool calls embedded in chat messages.
 *
 * This handler implements the high-level contract:
 *
 * - **Last call wins**: only the last `<virtual-tool-call>` block in a message is considered executable.
 * - **Atomic replace**: when a call is executed (or fails in a handled way), the call block is replaced with a
 *   `<virtual-tool-result>` block so the same call does not re-trigger on subsequent message events.
 * - **Consistency guard**: a message is expected to contain at most one `<virtual-tool-result>` tag. Multiple
 *   result tags are treated as an inconsistent state and execution is refused.
 *
 * ## Idempotency + lock strategy
 *
 * SillyTavern can emit multiple events for the same message (e.g. `MESSAGE_RECEIVED` and `MESSAGE_EDITED`) and
 * those can overlap in time. This handler uses an **in-process lock** keyed by `chatId:messageId` to ensure
 * only one processing flow runs concurrently for the same message.
 *
 * - If a concurrent call arrives while the lock is held, it returns `{ handled: false }` and leaves the
 *   message unchanged (i.e. “skip duplicate execution”).
 * - The lock is always released in `finally` to avoid deadlocks.
 *
 * Note: This lock is per JS runtime instance; it is not a distributed lock and does not persist across reloads.
 *
 * ## Failure-mode behavior
 *
 * The primary safety goal is **“execute at most once”**, even in the presence of errors:
 *
 * - If the call block contains invalid JSON, a `<virtual-tool-result>` is written with an error payload.
 * - If an unexpected exception occurs while a call block exists, a `<virtual-tool-result>` is still written to
 *   consume the call and prevent retry storms.
 * - If an unexpected exception occurs and no call block is available, we conservatively mark `handled=true`
 *   only when the message still contains a call tag (blocking repeated processing loops).
 */
import { extractLastCallBlock, replaceCallWithResult, validateSingleResultTag } from './virtual-tool-tag-manager'
import type { ToolCallEnvelope } from '@/app/services/virtual-tools/tool-contracts'
import type { ChatVfsRuntime } from '@/app/services/vfs-runtime/chat-vfs-runtime'
import type { ChatVfsLogService } from '@/app/services/vfs-log/chat-vfs-log-service'

/** 进程内并发锁：同 chatId:messageId 只允许一个处理流程在跑。 */
const locks = new Set<string>()

function summarizeArgs(args: Record<string, unknown>): string {
  const keys = Object.keys(args)
  return keys.slice(0, 4).join(',')
}

/**
 * Executes (at most) one virtual tool-call batch found in a message and returns an updated message text.
 *
 * The handler is designed to be called from a message pipeline that can mutate the in-memory message record.
 * It is pure with respect to the message text (input/output), but it also emits logs via `ChatVfsLogService`
 * and performs runtime execution via `ChatVfsRuntime`.
 */
export class VirtualToolMessageHandler {
  constructor(
    private readonly runtime: ChatVfsRuntime,
    private readonly logs: ChatVfsLogService,
  ) {}

  /**
   * Processes one message.
   *
   * ### When it returns `handled=false`
   * - Virtual tool calls are disabled in the runtime.
   * - There is no executable call block (no `<virtual-tool-call>` tag, or the extracted content is empty).
   * - The message contains multiple result tags (inconsistent state), so execution is refused.
   * - Another concurrent processing flow is already handling the same `chatId:messageId` (in-process lock).
   *
   * ### When it returns `handled=true`
   * - A call was executed and replaced with a `<virtual-tool-result>`.
   * - A call was found but failed in a handled way (e.g. invalid JSON), and was still replaced with a result.
   * - An unexpected exception happened while a call block exists; we still replace the call with a result to
   *   prevent retry storms.
   * - As a last resort, if an exception happened and we cannot re-locate the call block, we may return
   *   `handled=true` when the message still contains a call tag to block repeated reprocessing loops.
   *
   * @param input - Message identity and raw text.
   * @returns Whether the message was handled, and the (possibly updated) message text.
   */
  process(input: { chatId: string; messageId: string; messageText: string }): { handled: boolean; messageText: string } {
    const lockKey = `${input.chatId}:${input.messageId}`
    // 同一消息并发事件（received/edited）时，后续请求直接跳过，避免重复执行。
    if (locks.has(lockKey)) return { handled: false, messageText: input.messageText }
    locks.add(lockKey)
    const startedAt = Date.now()
    let callBlock = extractLastCallBlock(input.messageText)
    try {
      if (!this.runtime.isVirtualToolCallEnabled()) {
        return { handled: false, messageText: input.messageText }
      }
      // 一个消息只允许最多一个 result 标签；多标签视为不一致状态并拒绝执行。
      const resultTag = validateSingleResultTag(input.messageText)
      if (!resultTag.ok) {
        // Refuse to execute when multiple result tags exist to avoid ambiguous or conflicting outcomes.
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
      // 没有可执行调用块时，不改消息内容。
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
      // 进入运行时执行（含原子事务语义：成功才落盘）。
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
        // 异常场景也要写 result 并吞掉 call，保证消息不会进入“反复重试风暴”。
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
      // 最后兜底：若文本里仍有 call 标签，则标记 handled=true 阻断后续重复处理。
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
    // 工具级日志用于快速定位“批次里是哪一步失败/截断”，与 batch 总日志互补。
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
