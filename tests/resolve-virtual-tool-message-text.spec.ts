import { describe, expect, it } from 'vitest'
import {
  resolveVirtualToolMessageText,
  resolveVirtualToolMessageTextWithSource,
} from '@/app/services/message/resolve-virtual-tool-message-text'

describe('resolveVirtualToolMessageText', () => {
  it('prefers args[1] for MESSAGE_EDITED when mes is stale but args[1] has virtual tool call', () => {
    const record = { mes: 'old', message: 'old-msg' }
    const args1 = '<virtual-tool-call>{}</virtual-tool-call>'
    expect(
      resolveVirtualToolMessageText('MESSAGE_EDITED', record, [0, args1]),
    ).toBe(args1)
    expect(resolveVirtualToolMessageTextWithSource('MESSAGE_EDITED', record, [0, args1]).textSource).toBe('args[1]')
  })

  it('prefers args[1] for MESSAGE_UPDATED when non-empty string', () => {
    const record = { mes: 'stale' }
    expect(resolveVirtualToolMessageText('MESSAGE_UPDATED', record, [1, 'fresh'])).toBe('fresh')
  })

  it('falls back mes then message for MESSAGE_EDITED when args[1] is empty string', () => {
    expect(resolveVirtualToolMessageText('MESSAGE_EDITED', { mes: 'm', message: 'msg' }, [0, ''])).toBe('m')
    expect(resolveVirtualToolMessageText('MESSAGE_EDITED', { message: 'msg' }, [0, ''])).toBe('msg')
  })

  it('keeps MESSAGE_RECEIVED order mes → message → args[1]', () => {
    expect(resolveVirtualToolMessageText('MESSAGE_RECEIVED', { mes: 'a', message: 'b' }, [0, 'c'])).toBe('a')
    expect(resolveVirtualToolMessageText('MESSAGE_RECEIVED', { message: 'b' }, [0, 'c'])).toBe('b')
    expect(resolveVirtualToolMessageText('MESSAGE_RECEIVED', {}, [0, 'c'])).toBe('c')
  })

  it('MESSAGE_RECEIVED prefers mes even when args[1] differs', () => {
    expect(resolveVirtualToolMessageText('MESSAGE_RECEIVED', { mes: 'from-record' }, [0, 'from-args'])).toBe(
      'from-record',
    )
  })
})
