import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import VfsActionMenu from '@/app/components/business-components/VfsActionMenu.vue'

describe('VfsActionMenu', () => {
  it('shows global create actions without selection', async () => {
    const wrapper = mount(VfsActionMenu, {
      props: { entity: null },
    })

    expect(wrapper.text()).toContain('新建目录')
    expect(wrapper.text()).toContain('新建文件')
    expect(wrapper.text()).not.toContain('重命名')

    await wrapper.get('button[data-action="create-directory"]').trigger('click')
    expect(wrapper.emitted('globalActionSelected')?.[0]).toEqual(['create-directory'])
  })

  it('shows entity actions when an entry is selected', () => {
    const wrapper = mount(VfsActionMenu, {
      props: {
        entity: {
          id: 'f1',
          name: 'readme.md',
          kind: 'file',
          path: '/readme.md',
        },
      },
    })

    expect(wrapper.text()).toContain('新建目录')
    expect(wrapper.text()).toContain('新建文件')
    expect(wrapper.text()).toContain('重命名')
    expect(wrapper.text()).toContain('打开')
  })
})
