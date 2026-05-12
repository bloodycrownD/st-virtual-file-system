import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import VfsListboxField from '@/app/components/pure-components/VfsListboxField.vue'

describe('VfsListboxField', () => {
  const wrappers: Array<{ unmount: () => void }> = []
  afterEach(() => {
    while (wrappers.length) wrappers.pop()?.unmount()
  })

  it('opens, selects via click, updates model, and closes on Escape', async () => {
    const wrapper = mount(VfsListboxField, {
      attachTo: document.body,
      props: {
        modelValue: '',
        options: [
          { label: 'A', value: 'a' },
          { label: 'B', value: 'b' },
        ],
        placeholder: 'Pick…',
        ariaLabel: 'Test listbox',
        dataTestid: 'test-lb',
      },
    })
    wrappers.push(wrapper)

    await wrapper.get('[data-testid="test-lb"]').trigger('click')
    await nextTick()
    expect(wrapper.find('[data-testid="test-lb-listbox"]').exists()).toBe(true)

    const optB = wrapper.findAll('[data-testid="test-lb-listbox"] button[role="option"]').find((b) => b.text() === 'B')
    expect(optB).toBeTruthy()
    await optB!.trigger('click')
    await nextTick()

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['b'])
    expect(wrapper.find('[data-testid="test-lb-listbox"]').exists()).toBe(false)

    await wrapper.get('[data-testid="test-lb"]').trigger('click')
    await nextTick()
    await wrapper.get('[data-testid="test-lb"]').trigger('keydown', { key: 'Escape' })
    await nextTick()
    expect(wrapper.find('[data-testid="test-lb-listbox"]').exists()).toBe(false)
  })

  it('closes on outside mousedown', async () => {
    const wrapper = mount(VfsListboxField, {
      attachTo: document.body,
      props: {
        modelValue: 'a',
        options: [{ label: 'A', value: 'a' }],
        ariaLabel: 'Outside',
        dataTestid: 'outside-lb',
      },
    })
    wrappers.push(wrapper)

    await wrapper.get('[data-testid="outside-lb"]').trigger('click')
    await nextTick()
    expect(wrapper.find('[data-testid="outside-lb-listbox"]').exists()).toBe(true)

    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await nextTick()
    expect(wrapper.find('[data-testid="outside-lb-listbox"]').exists()).toBe(false)
  })
})
