import { describe, expect, it } from 'vitest'
import { getTextareaContentWidth } from '@/app/composables/components-composables/editor-line-mirror'

describe('editor line mirror', () => {
  it('derives textarea content width from css width when clientWidth is zero', () => {
    const textarea = document.createElement('textarea')
    textarea.style.cssText = 'box-sizing:border-box;width:240px;padding:8px 10px;'
    document.body.appendChild(textarea)

    expect(getTextareaContentWidth(textarea)).toBe(220)

    document.body.removeChild(textarea)
  })
})
