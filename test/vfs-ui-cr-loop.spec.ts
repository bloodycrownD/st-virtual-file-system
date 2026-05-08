import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import VfsActionMenu from '@/app/components/business-components/VfsActionMenu.vue'
import VfsCommitTab from '@/app/components/business-components/VfsCommitTab.vue'
import VfsHistoryScreen from '@/app/screens/business-screens/VfsHistoryScreen.vue'
import VfsMainScreen from '@/app/screens/business-screens/VfsMainScreen.vue'
import EditorScreen from '@/app/screens/pure-screens/EditorScreen.vue'
import { createVfsCommitHistoryStore } from '@/app/composables/components-composables/useVfsCommitHistory'

const dispatchSpy = vi.fn()

function getButtonByText(wrapper: ReturnType<typeof mount>, label: string) {
  const button = wrapper
    .findAll('button')
    .find((candidate) => candidate.text().trim().toLowerCase() === label.toLowerCase())
  if (!button) {
    throw new Error(`button "${label}" not found`)
  }
  return button
}

vi.mock('@/app/composables/screens-composables/useVfsHistoryStateMachine', () => ({
  createVfsHistoryStateMachine: () => ({
    state: { status: 'idle' },
    dispatch: dispatchSpy,
  }),
}))

describe('vfs ui cr loop fixes', () => {
  beforeEach(() => {
    dispatchSpy.mockReset()
  })

  it('maps batch rollback success and failure to batch events', async () => {
    const wrapper = mount(VfsHistoryScreen)

    await wrapper.findComponent(VfsCommitTab).vm.$emit('rollback-status', { kind: 'batch', status: 'succeeded' })
    expect(dispatchSpy).toHaveBeenCalledWith({ type: 'BATCH_ROLLBACK_SUCCESS' })

    await wrapper
      .findComponent(VfsCommitTab)
      .vm.$emit('rollback-status', { kind: 'batch', status: 'failed', sourceVersionId: 'v1' })
    expect(dispatchSpy).toHaveBeenCalledWith({
      type: 'BATCH_ROLLBACK_FAILED',
      errorCode: 'E_BATCH_ROLLBACK_FAILED',
      message: 'Batch rollback failed',
    })
  })

  it('guards runtime action triggering by entity kind', async () => {
    const wrapper = mount(VfsActionMenu, {
      props: {
        entity: { id: 'file-1', name: 'a.md', kind: 'file', path: '/a.md' },
      },
    })

    expect(wrapper.text()).toContain('view')
    expect(wrapper.text()).not.toContain('open-slideshow')

    await wrapper.get('[data-action="view"]').trigger('click')
    expect(wrapper.emitted('actionSelected')?.[0]).toEqual(['view'])

    expect(wrapper.find('[data-action="open-slideshow"]').exists()).toBe(false)
  })

  it('stores structured commit history sorted by time desc', () => {
    const store = createVfsCommitHistoryStore()
    store.appendRecord({
      time: '2026-05-08T10:00:00.000Z',
      operator: 'assistant',
      actionType: 'save',
      scope: '/docs',
      sourceVersionId: 'v1',
    })
    store.appendRecord({
      time: '2026-05-08T11:00:00.000Z',
      operator: 'assistant',
      actionType: 'rollback',
      scope: '/docs/a.md',
      sourceVersionId: 'v2',
    })

    expect(store.records.value[0]?.sourceVersionId).toBe('v2')
    expect(store.records.value[1]?.sourceVersionId).toBe('v1')
  })

  it('shows editor history panel and emits manual rollback with source version', async () => {
    const wrapper = mount(EditorScreen, {
      props: {
        modelValue: 'draft',
        historyRecords: [
          {
            time: '2026-05-08T11:00:00.000Z',
            operator: 'assistant',
            actionType: 'save',
            scope: '/docs/a.md',
            sourceVersionId: 'v42',
          },
        ],
      },
    })

    expect(wrapper.text()).toContain('v42')
    await wrapper.get('[data-testid="editor-history-rollback-id"]').setValue('v42')
    await wrapper.get('[data-testid="editor-history-rollback-submit"]').trigger('click')

    expect(wrapper.emitted('manualRollbackRequested')?.[0]).toEqual([{ sourceVersionId: 'v42' }])
  })

  it('switches between mobile and desktop layout modes', async () => {
    window.innerWidth = 375
    const wrapper = mount(VfsMainScreen)
    expect(wrapper.get('[data-testid="vfs-main-layout"]').attributes('data-layout')).toBe('mobile')

    window.innerWidth = 1366
    window.dispatchEvent(new Event('resize'))
    await wrapper.vm.$nextTick()

    expect(wrapper.get('[data-testid="vfs-main-layout"]').attributes('data-layout')).toBe('desktop')
  })

  it('prompts before direct mode switch and keeps editor when cancelled', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const wrapper = mount(VfsMainScreen)

    await getButtonByText(wrapper, 'Open Editor').trigger('click')
    await wrapper.get('textarea.vfs-editor').setValue('unsaved draft')
    await getButtonByText(wrapper, 'Open Reader').trigger('click')

    expect(confirmSpy).toHaveBeenCalled()
    expect(wrapper.find('textarea.vfs-editor').exists()).toBe(true)
  })

  it('prompts before action-driven mode switch and discards draft on force leave', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const wrapper = mount(VfsMainScreen)

    await getButtonByText(wrapper, 'Open Editor').trigger('click')
    await wrapper.get('textarea.vfs-editor').setValue('discard me')
    await wrapper.get('[data-action="view"]').trigger('click')

    expect(confirmSpy).toHaveBeenCalled()
    expect(wrapper.find('textarea.vfs-editor').exists()).toBe(false)

    await getButtonByText(wrapper, 'Open Editor').trigger('click')
    expect((wrapper.get('textarea.vfs-editor').element as HTMLTextAreaElement).value).toBe('')
  })

  it('prompts before tab switch and stays on files when cancelled', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const wrapper = mount(VfsMainScreen)

    await getButtonByText(wrapper, 'Open Editor').trigger('click')
    await wrapper.get('textarea.vfs-editor').setValue('dirty content')
    await wrapper.get('.vfs-tabs button:nth-of-type(2)').trigger('click')

    expect(confirmSpy).toHaveBeenCalled()
    expect(wrapper.find('textarea.vfs-editor').exists()).toBe(true)
    expect(wrapper.get('[data-testid="vfs-main-layout"]').exists()).toBe(true)
  })
})
