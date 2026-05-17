import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import VfsMainScreen from '@/app/screens/business-screens/VfsMainScreen.vue'

describe('VfsMainScreen ZIP actions', () => {
  it('shows export and import buttons in chat scope', () => {
    const wrapper = mount(VfsMainScreen, { props: { scope: 'chat' } })
    expect(wrapper.find('[data-testid="vfs-zip-export"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="vfs-zip-import"]').exists()).toBe(true)
  })

  it('shows export and import buttons in template scope', () => {
    const wrapper = mount(VfsMainScreen, { props: { scope: 'template' } })
    expect(wrapper.find('[data-testid="vfs-zip-export"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="vfs-zip-import"]').exists()).toBe(true)
  })
})
