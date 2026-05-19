/**
 * @module virtual-tool-call-parser
 *
 * Strict parse + optional conservative repair for `<virtual-tool-call>` JSON envelopes.
 *
 * Repair is gated by `repairEnabled` and `assessRepairability` before invoking `jsonrepair`.
 * Failures never synthesize protocol results here—the handler keeps the call tag and returns
 * `handled: false`.
 */
import { jsonrepair } from 'jsonrepair'
import type { ToolCallEnvelope } from '@/app/services/virtual-tools/tool-contracts'
import { assessRepairability, type JsonRepairReasonCode } from './json-repair-policy'

export interface ParseVirtualToolEnvelopeOptions {
  /** When false, strict `JSON.parse` failure yields `strict-failed` without repair attempt. */
  repairEnabled: boolean
}

export type ParseVirtualToolEnvelopeResult =
  | { kind: 'parsed'; envelope: ToolCallEnvelope }
  | { kind: 'repaired'; envelope: ToolCallEnvelope; repairNotes: string[] }
  | { kind: 'strict-failed'; errorMessage: string }
  | { kind: 'non-repairable'; reasonCode: JsonRepairReasonCode; errorMessage: string }
  | { kind: 'repair-failed'; errorMessage: string; reasonCode?: JsonRepairReasonCode }

/**
 * Parses (and optionally repairs) virtual tool-call JSON.
 *
 * @param callContent - Inner text of `<virtual-tool-call>` (trimmed by caller).
 * @param options - Repair toggle from extension settings.
 */
export function parseVirtualToolEnvelope(
  callContent: string,
  options: ParseVirtualToolEnvelopeOptions,
): ParseVirtualToolEnvelopeResult {
  try {
    return { kind: 'parsed', envelope: JSON.parse(callContent) as ToolCallEnvelope }
  } catch (strictError) {
    const strictMessage = strictError instanceof Error ? strictError.message : String(strictError)
    if (!options.repairEnabled) {
      return { kind: 'strict-failed', errorMessage: strictMessage }
    }
    const assessment = assessRepairability(callContent)
    if (!assessment.allowed) {
      return {
        kind: 'non-repairable',
        reasonCode: assessment.reasonCode ?? 'INDETERMINATE_STRUCTURE',
        errorMessage: strictMessage,
      }
    }
    try {
      const repairedText = jsonrepair(callContent)
      const envelope = JSON.parse(repairedText) as ToolCallEnvelope
      const repairNotes = ['jsonrepair applied after conservative policy gate']
      if (repairedText !== callContent) {
        repairNotes.push('structural normalization')
      }
      return { kind: 'repaired', envelope, repairNotes }
    } catch (repairError) {
      const repairMessage = repairError instanceof Error ? repairError.message : String(repairError)
      return {
        kind: 'repair-failed',
        errorMessage: repairMessage,
        reasonCode: assessment.reasonCode,
      }
    }
  }
}
