import type { StMessageEventKind } from '@/infra/sillytarvern/events/st-event-types'

export type VirtualToolMessageTextSource = 'args[1]' | 'mes' | 'message' | 'none'

export interface VirtualToolMessageTextResolution {
  text: string | undefined
  textSource: VirtualToolMessageTextSource
}

function readMes(record: Record<string, unknown> | undefined): string | undefined {
  if (!record) return undefined
  if (typeof record.mes === 'string') return record.mes
  return undefined
}

function readMessage(record: Record<string, unknown> | undefined): string | undefined {
  if (!record) return undefined
  if (typeof record.message === 'string') return record.message
  return undefined
}

function readArgs1(args: unknown[]): string | undefined {
  return typeof args[1] === 'string' ? args[1] : undefined
}

/**
 * Resolves chat message text for virtual-tool processing.
 * WHY: EDITED/UPDATED may deliver fresh text in `args[1]` while `record.mes` is still stale on some ST builds.
 */
export function resolveVirtualToolMessageTextWithSource(
  kind: StMessageEventKind,
  record: Record<string, unknown> | undefined,
  args: unknown[],
): VirtualToolMessageTextResolution {
  const mes = readMes(record)
  const message = readMessage(record)
  const arg1 = readArgs1(args)

  if (kind === 'MESSAGE_RECEIVED') {
    if (mes !== undefined) return { text: mes, textSource: 'mes' }
    if (message !== undefined) return { text: message, textSource: 'message' }
    if (arg1 !== undefined) return { text: arg1, textSource: 'args[1]' }
    return { text: undefined, textSource: 'none' }
  }

  if (kind === 'MESSAGE_EDITED' || kind === 'MESSAGE_UPDATED') {
    if (typeof args[1] === 'string' && args[1].length > 0) {
      return { text: args[1], textSource: 'args[1]' }
    }
    if (mes !== undefined) return { text: mes, textSource: 'mes' }
    if (message !== undefined) return { text: message, textSource: 'message' }
    return { text: undefined, textSource: 'none' }
  }

  return { text: undefined, textSource: 'none' }
}

export function resolveVirtualToolMessageText(
  kind: StMessageEventKind,
  record: Record<string, unknown> | undefined,
  args: unknown[],
): string | undefined {
  return resolveVirtualToolMessageTextWithSource(kind, record, args).text
}
