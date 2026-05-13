import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import VfsActionMenu from '@/app/components/business-components/VfsActionMenu.vue'

describe('VfsActionMenu', () => {
  it('shows slideshow action label as 幻灯片', async () => {
    const wrapper = mount(VfsActionMenu, {
      props: {
        entity: {
          id: 'dir-1',
          name: 'docs',
          kind: 'directory',
          path: '/docs',
        },
      },
    })

    await wrapper.get('[data-testid="vfs-action-menu-toggle"]').trigger('click')
    expect(wrapper.text()).toContain('幻灯片')
    expect(wrapper.text()).not.toContain('幻灯片/阅读模式')
  })
})
