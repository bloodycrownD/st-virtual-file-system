import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import VfsFileManagerPanel from '@/app/components/business-components/VfsFileManagerPanel.vue'

describe('VfsFileManagerPanel row badge', () => {
  it('renders follow-parent badge label (UT-B1)', () => {
    const wrapper = mount(VfsFileManagerPanel, {
      props: {
        mode: 'list',
        currentPath: '/',
        entries: [
          {
            path: '/a.txt',
            name: 'a.txt',
            kind: 'file' as const,
            rowBadgeLabel: '随目录',
            rowBadgeIconClass: 'fa-solid fa-sitemap',
            rowBadgeTitle: '纳入方式：随父目录规则（由当前目录纳入规则决定）',
            rowBadgeAria: '纳入方式：随父目录规则（由当前目录纳入规则决定）',
          },
        ],
      },
    })
    const badge = wrapper.get('[data-testid="vfs-fm-row-badge"]')
    expect(badge.text()).toContain('随目录')
    expect(badge.classes()).not.toContain('fa-solid')
    expect(wrapper.get('.fa-sitemap').exists()).toBe(true)
  })

  it('renders directory rule-off badge label (UT-B2)', () => {
    const wrapper = mount(VfsFileManagerPanel, {
      props: {
        mode: 'list',
        currentPath: '/',
        entries: [
          {
            path: '/docs',
            name: 'docs',
            kind: 'directory' as const,
            rowBadgeLabel: '规则·关',
            rowBadgeIconClass: 'fa-solid fa-toggle-off',
            rowBadgeTitle: '目录纳入规则：未启用',
            rowBadgeAria: '目录纳入规则：未启用',
          },
        ],
      },
    })
    const badge = wrapper.get('[data-testid="vfs-fm-row-badge"]')
    expect(badge.text()).toContain('规则·关')
    expect(wrapper.get('.fa-toggle-off').exists()).toBe(true)
  })
})
