import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import VfsActionMenu from '@/app/components/business-components/VfsActionMenu.vue'
import VfsCommitTab from '@/app/components/business-components/VfsCommitTab.vue'
import VfsHistoryScreen from '@/app/screens/business-screens/VfsHistoryScreen.vue'
import VfsMainScreen from '@/app/screens/business-screens/VfsMainScreen.vue'
import EditorScreen from '@/app/screens/pure-screens/EditorScreen.vue'
import VfsHistoryPanel from '@/app/components/business-components/VfsHistoryPanel.vue'
import { createVfsCommitHistoryStore } from '@/app/composables/components-composables/useVfsCommitHistory'
import { VFS_LOG_REFRESH_AUTO } from '@/app/composables/components-composables/useVfsMessageHooks'
import { vfsPersistenceStore } from '@/app/stores/vfs-store-singleton'

const dispatchSpy = vi.fn()
const useVfsCommitActionsMock = vi.fn<(summary: string) => Promise<boolean>>()
const useVfsRollbackActionMock = vi.fn<(commitId: string) => Promise<boolean>>()
const fetchLogsMock = vi.fn(async () => ({ items: [], total: 0 }))

function getButtonByText(wrapper: ReturnType<typeof mount>, label: string) {
  const button = wrapper
    .findAll('button')
    .find((candidate) => candidate.text().trim().toLowerCase() === label.toLowerCase())
  if (!button) {
    throw new Error(`button "${label}" not found`)
  }
  return button
}

async function triggerEntityAction(wrapper: ReturnType<typeof mount>, action: string) {
  const menu = wrapper.findComponent(VfsActionMenu)
  if (!menu.exists()) {
    throw new Error('VfsActionMenu not found')
  }
  await menu.get(`[data-action="${action}"]`).trigger('click')
}

async function selectDocsFile(wrapper: ReturnType<typeof mount>) {
  const list = wrapper.get('[data-testid="vfs-file-manager-list"]')
  const candidates = list.findAll('button.vfs-fm-item')
  const docsDir = candidates.find((btn) => btn.text().includes('docs')) // directory at root
  if (!docsDir) {
    throw new Error('docs directory not found')
  }
  await docsDir.trigger('dblclick')
  await wrapper.vm.$nextTick()

  const innerList = wrapper.get('[data-testid="vfs-file-manager-list"]')
  const innerCandidates = innerList.findAll('button.vfs-fm-item')
  const fileButton = innerCandidates.find((btn) => btn.text().includes('docs.md'))
  if (!fileButton) {
    throw new Error('docs.md not found')
  }
  await fileButton.trigger('click')
}

vi.mock('@/app/composables/screens-composables/useVfsHistoryStateMachine', () => ({
  createVfsHistoryStateMachine: () => ({
    state: { status: 'idle' },
    dispatch: dispatchSpy,
  }),
}))

vi.mock('@/app/composables/components-composables/useVfsCommitActions', () => ({
  useVfsCommitActions: (summary: string) => useVfsCommitActionsMock(summary),
}))

vi.mock('@/app/composables/components-composables/useVfsRollbackActions', () => ({
  useVfsRollbackAction: (commitId: string) => useVfsRollbackActionMock(commitId),
}))

vi.mock('@/app/services/vfs/logService', () => ({
  fetchLogs: (...args: unknown[]) => fetchLogsMock(...args),
}))

describe('vfs ui cr loop fixes', () => {
  beforeEach(() => {
    window.innerWidth = 1366
    dispatchSpy.mockReset()
    useVfsCommitActionsMock.mockReset()
    useVfsRollbackActionMock.mockReset()
    useVfsCommitActionsMock.mockResolvedValue(true)
    useVfsRollbackActionMock.mockResolvedValue(true)
    fetchLogsMock.mockClear()
    const now = Date.now()
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
            children: ['node-3'],
            mtime: now,
          },
          'node-3': {
            id: 'node-3',
            type: 'file',
            path: '/docs/docs.md',
            name: 'docs.md',
            parentId: 'node-2',
            size: 3,
            content: { encoding: 'plain', data: '# a', originalSize: 3 },
            mtime: now,
            ctime: now,
            updatedBy: 'user',
          },
        },
      },
      chatVfsVersions: [
        {
          id: 'commit-1',
          time: new Date(now).toISOString(),
          operator: 'assistant',
          actionType: 'save',
          scope: '/docs/docs.md',
          sourceVersion: { id: 'v1', reason: 'rollback-target' },
        },
      ],
    }))
  })

  it('maps rollback success and failure to history events', async () => {
    const wrapper = mount(VfsHistoryScreen)

    await wrapper.findComponent(VfsCommitTab).vm.$emit('rollback-status', { kind: 'single', status: 'succeeded' })
    expect(dispatchSpy).toHaveBeenCalledWith({ type: 'ROLLBACK_SUCCESS' })

    await wrapper
      .findComponent(VfsCommitTab)
      .vm.$emit('rollback-status', { kind: 'single', status: 'failed', sourceVersionId: 'v1' })
    expect(dispatchSpy).toHaveBeenCalledWith({
      type: 'ROLLBACK_FAILED',
      errorCode: 'E_ROLLBACK_FAILED',
      message: 'Rollback failed',
    })
  })

  it('guards runtime action triggering by entity kind', async () => {
    const wrapper = mount(VfsActionMenu, {
      props: {
        entity: { id: 'file-1', name: 'a.md', kind: 'file', path: '/a.md' },
      },
    })

    expect(wrapper.text()).toContain('查看')
    expect(wrapper.text()).not.toContain('幻灯片/阅读模式')

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
    await wrapper.get('[data-testid="editor-history-rollback-list"] input[type="radio"]').setValue(true)
    await wrapper.get('[data-testid="editor-history-rollback-submit"]').trigger('click')

    expect(wrapper.emitted('manualRollbackRequested')?.[0]).toEqual([{ sourceVersionId: 'v42' }])
  })

  it('maps manual rollback selection to valid commit snapshot ids', async () => {
    const wrapper = mount(EditorScreen, {
      props: {
        modelValue: 'draft',
        historyRecords: [
          {
            commitId: 'commit-raw-1',
            time: '2026-05-08T12:00:00.000Z',
            operator: 'assistant',
            actionType: 'save',
            scope: '/docs/a.md',
            sourceVersionId: 'legacy-source-v1',
          },
        ],
      },
    })

    await wrapper.get('[data-testid="editor-history-rollback-list"] input[type="radio"]').setValue(true)
    await wrapper.get('[data-testid="editor-history-rollback-submit"]').trigger('click')

    expect(wrapper.emitted('manualRollbackRequested')?.[0]).toEqual([{ sourceVersionId: 'commit-raw-1' }])
  })

  it('uses single-target rollback interaction in commit tab', async () => {
    const wrapper = mount(VfsCommitTab, {
      props: {
        commits: [
          {
            id: 'commit-1',
            time: '2026-05-08T11:00:00.000Z',
            operator: 'assistant',
            actionType: 'save',
            scope: '/docs/a.md',
          },
          {
            id: 'commit-2',
            time: '2026-05-08T10:00:00.000Z',
            operator: 'assistant',
            actionType: 'save',
            scope: '/docs/b.md',
          },
        ],
      },
    })

    const rollbackButtonBefore = wrapper.get('button')
    expect(rollbackButtonBefore.text()).toContain('回滚到所选提交')
    expect(rollbackButtonBefore.attributes('disabled')).toBeDefined()

    const radios = wrapper.findAll('input[type="radio"]')
    await radios[0].setValue(true)
    await wrapper.get('button').trigger('click')

    expect(useVfsRollbackActionMock).toHaveBeenCalledWith('commit-1')
    expect(wrapper.emitted('rollbackStatus')?.[0]).toEqual([{ kind: 'single', status: 'rollingBack', sourceVersionId: 'commit-1' }])
    expect(wrapper.emitted('rollbackStatus')?.[1]).toEqual([
      { kind: 'single', status: 'succeeded', sourceVersionId: 'commit-1' },
    ])
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

  it('prompts before action-driven mode switch and keeps editor when cancelled', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const wrapper = mount(VfsMainScreen)

    await selectDocsFile(wrapper)
    await triggerEntityAction(wrapper, 'edit')
    await wrapper.get('textarea.vfs-editor').setValue('unsaved draft')
    await triggerEntityAction(wrapper, 'view')

    expect(confirmSpy).toHaveBeenCalled()
    expect(wrapper.find('textarea.vfs-editor').exists()).toBe(true)
  })

  it('prompts before action-driven mode switch and discards draft on force leave', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const wrapper = mount(VfsMainScreen)

    await selectDocsFile(wrapper)
    await triggerEntityAction(wrapper, 'edit')
    await wrapper.get('textarea.vfs-editor').setValue('discard me')
    await wrapper.get('[data-action="view"]').trigger('click')

    expect(confirmSpy).toHaveBeenCalled()
    expect(wrapper.find('textarea.vfs-editor').exists()).toBe(false)

    await triggerEntityAction(wrapper, 'edit')
    expect((wrapper.get('textarea.vfs-editor').element as HTMLTextAreaElement).value).toBe('')
  })

  it('prompts before tab switch and stays on files when cancelled', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const wrapper = mount(VfsMainScreen)

    await selectDocsFile(wrapper)
    await triggerEntityAction(wrapper, 'edit')
    await wrapper.get('textarea.vfs-editor').setValue('dirty content')
    await wrapper.get('.vfs-tabs button:nth-of-type(2)').trigger('click')

    expect(confirmSpy).toHaveBeenCalled()
    expect(wrapper.find('textarea.vfs-editor').exists()).toBe(true)
    expect(wrapper.get('[data-testid="vfs-main-layout"]').exists()).toBe(true)
  })

  it('wires editor save action to commit flow and appends commit record on success', async () => {
    const wrapper = mount(VfsMainScreen)
    await selectDocsFile(wrapper)
    await triggerEntityAction(wrapper, 'edit')
    await wrapper.get('textarea.vfs-editor').setValue('new content')
    await wrapper.get('[data-testid="editor-save-submit"]').trigger('click')
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    expect(useVfsCommitActionsMock).toHaveBeenCalledTimes(1)
    expect(useVfsCommitActionsMock).toHaveBeenCalledWith('/docs/docs.md')
    expect(dispatchSpy).toHaveBeenCalledWith({ type: 'SAVE_REQUEST' })
    expect(dispatchSpy).toHaveBeenCalledWith({ type: 'SAVE_SUCCESS' })
    expect(wrapper.text()).toContain('save')
    expect(wrapper.text()).toContain('/docs/docs.md')

    await triggerEntityAction(wrapper, 'view')
    expect(wrapper.find('textarea.vfs-editor').exists()).toBe(false)
    expect(wrapper.find('.vfs-reader').exists()).toBe(true)
  })

  it('allows overlapping save and rollback requests and leaves resolution to execution result', async () => {
    let resolveSave: ((value: boolean) => void) | undefined
    useVfsCommitActionsMock.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveSave = resolve
      }),
    )

    const wrapper = mount(VfsMainScreen)
    await selectDocsFile(wrapper)
    await triggerEntityAction(wrapper, 'edit')
    await wrapper.get('textarea.vfs-editor').setValue('pending save')
    await wrapper.get('[data-testid="editor-save-submit"]').trigger('click')
    const radio = wrapper.find('[data-testid="editor-history-rollback-list"] input[type="radio"]')
    if (radio.exists()) {
      await radio.setValue(true)
    }
    await wrapper.get('[data-testid="editor-history-rollback-submit"]').trigger('click')

    expect(useVfsCommitActionsMock).toHaveBeenCalledTimes(1)
    expect(useVfsRollbackActionMock).toHaveBeenCalledTimes(1)

    resolveSave?.(true)
    await Promise.resolve()
    await wrapper.vm.$nextTick()
  })

  it('applies dirty guard to popup-close exit event and cancels close when requested', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const wrapper = mount(VfsMainScreen)
    await selectDocsFile(wrapper)
    await triggerEntityAction(wrapper, 'edit')
    await wrapper.get('textarea.vfs-editor').setValue('unsaved by popup close')
    const beforeCloseEvent = new CustomEvent('VFS_POPUP_BEFORE_CLOSE', { cancelable: true })
    const allowed = window.dispatchEvent(beforeCloseEvent)

    expect(confirmSpy).toHaveBeenCalled()
    expect(allowed).toBe(false)
  })

  it('disables rollback controls while rollback request is in progress', async () => {
    let resolveRollback: ((value: boolean) => void) | undefined
    useVfsRollbackActionMock.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveRollback = resolve
      }),
    )
    const wrapper = mount(VfsHistoryPanel)
    await wrapper.get('input').setValue('commit-1')
    await wrapper.get('button').trigger('click')
    await wrapper.vm.$nextTick()

    const rollbackButton = wrapper.get('button')
    expect(rollbackButton.attributes('disabled')).toBeDefined()
    expect(rollbackButton.text().toLowerCase()).toContain('rolling')

    resolveRollback?.(true)
    await Promise.resolve()
    await wrapper.vm.$nextTick()
    expect(wrapper.get('button').attributes('disabled')).toBeUndefined()
  })

  it('renders a real desktop enhanced layout without losing actions', async () => {
    window.innerWidth = 1366
    const wrapper = mount(VfsMainScreen)
    expect(wrapper.get('[data-testid="vfs-desktop-grid"]').exists()).toBe(true)

    await selectDocsFile(wrapper)
    await triggerEntityAction(wrapper, 'edit')
    expect(wrapper.find('textarea.vfs-editor').exists()).toBe(true)
    expect(wrapper.get('[data-testid="vfs-desktop-grid"]').exists()).toBe(true)
    expect(wrapper.findComponent(VfsActionMenu).exists()).toBe(true)
  })

  it('uses More dropdown semantics for Tab1 actions', async () => {
    const wrapper = mount(VfsMainScreen)
    const menu = wrapper.findComponent(VfsActionMenu)
    expect(menu.get('summary').text()).toContain('更多操作')
    expect(menu.get('details.vfs-action-menu').exists()).toBe(true)
  })

  it('triggers one immediate auto log refresh on message event', async () => {
    const wrapper = mount(VfsMainScreen)
    window.dispatchEvent(new CustomEvent(VFS_LOG_REFRESH_AUTO))
    await wrapper.get('.vfs-tabs button:nth-of-type(3)').trigger('click')
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    expect(fetchLogsMock).toHaveBeenCalledTimes(1)
  })
})
