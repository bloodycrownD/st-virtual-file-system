import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import VfsActionMenu from '@/app/components/business-components/VfsActionMenu.vue'
import VfsCreateEntityModal from '@/app/components/business-components/VfsCreateEntityModal.vue'
import VfsFileManagerPanel from '@/app/components/business-components/VfsFileManagerPanel.vue'
import VfsMainScreen from '@/app/screens/business-screens/VfsMainScreen.vue'
import { vfsPersistenceStore } from '@/app/stores/vfs-store-singleton'

describe('create refresh immediate', () => {
  beforeEach(() => {
    window.innerWidth = 1366
    ;(globalThis as { toastr: { error: (message: string) => void } }).toastr = { error: vi.fn() }
    const now = Date.now()
    vfsPersistenceStore.updateExtension((draft) => ({
      ...draft,
      extensionTemplateVfsSnapshot: {
        schemaVersion: 1,
        rootId: 't-root',
        nodes: {
          't-root': {
            id: 't-root',
            type: 'directory',
            path: '/',
            name: '',
            parentId: null,
            children: ['t-file'],
            mtime: now,
          },
          't-file': {
            id: 't-file',
            type: 'file',
            path: '/template.md',
            name: 'template.md',
            parentId: 't-root',
            size: 8,
            content: { encoding: 'plain', data: 'template', originalSize: 8 },
            mtime: now,
            ctime: now,
            updatedBy: 'assistant',
          },
        },
      },
    }))
    vfsPersistenceStore.updateChat((draft) => ({
      ...draft,
      chatVfsSnapshot: {
        schemaVersion: 1,
        rootId: 'root',
        nodes: {
          root: {
            id: 'root',
            type: 'directory',
            path: '/',
            name: '',
            parentId: null,
            children: ['node-2'],
            mtime: now,
          },
          'node-2': {
            id: 'node-2',
            type: 'directory',
            path: '/docs',
            name: 'docs',
            parentId: 'root',
            children: [],
            mtime: now,
          },
        },
      },
    }))
  })

  it('shows newly created file immediately in chat scope current directory', async () => {
    const wrapper = mount(VfsMainScreen)
    await wrapper.findComponent(VfsActionMenu).get('[data-action="create-file"]').trigger('click')
    await wrapper.findComponent(VfsCreateEntityModal).vm.$emit('confirm', 'instant-chat.md')
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    const panel = wrapper.findComponent(VfsFileManagerPanel)
    const entries = panel.props('entries') as Array<{ name: string }>
    expect(entries.map((entry) => entry.name)).toContain('instant-chat.md')
  })

  it('shows newly created directory immediately in template scope current directory', async () => {
    const wrapper = mount(VfsMainScreen, {
      props: {
        scope: 'template',
      },
    })
    await wrapper.findComponent(VfsActionMenu).get('[data-action="create-directory"]').trigger('click')
    await wrapper.findComponent(VfsCreateEntityModal).vm.$emit('confirm', 'instant-template-dir')
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    const panel = wrapper.findComponent(VfsFileManagerPanel)
    const entries = panel.props('entries') as Array<{ name: string }>
    expect(entries.map((entry) => entry.name)).toContain('instant-template-dir')
  })
})
