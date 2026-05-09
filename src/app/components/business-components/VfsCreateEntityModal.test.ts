import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import VfsCreateEntityModal from '@/app/components/business-components/VfsCreateEntityModal.vue'

describe('VfsCreateEntityModal', () => {
  it('auto-focuses input when opened', async () => {
    const wrapper = mount(VfsCreateEntityModal, {
      attachTo: document.body,
      props: {
        open: true,
        kind: 'directory',
      },
    })

    await nextTick()
    await nextTick()
    const input = wrapper.get('input').element as HTMLInputElement
    expect(document.activeElement).toBe(input)
    wrapper.unmount()
  })

  it('handles Enter confirm and Esc cancel', async () => {
    const wrapper = mount(VfsCreateEntityModal, {
      props: {
        open: true,
        kind: 'file',
      },
    })

    await wrapper.get('input').setValue('notes.md')
    await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('confirm')?.[0]).toEqual(['notes.md'])

    await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('cancel')?.length).toBe(1)
  })
})
