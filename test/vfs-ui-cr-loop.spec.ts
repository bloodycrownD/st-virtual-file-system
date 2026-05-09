import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import VfsActionMenu from '@/app/components/business-components/VfsActionMenu.vue'
import VfsCommitTab from '@/app/components/business-components/VfsCommitTab.vue'
import VfsCreateEntityModal from '@/app/components/business-components/VfsCreateEntityModal.vue'
import VfsFileManagerPanel from '@/app/components/business-components/VfsFileManagerPanel.vue'
import VfsHistoryScreen from '@/app/screens/business-screens/VfsHistoryScreen.vue'
import VfsMainScreen from '@/app/screens/business-screens/VfsMainScreen.vue'
import EditorScreen from '@/app/screens/pure-screens/EditorScreen.vue'
import VfsHistoryPanel from '@/app/components/business-components/VfsHistoryPanel.vue'
import { createVfsCommitHistoryStore } from '@/app/composables/components-composables/useVfsCommitHistory'
import { VFS_LOG_REFRESH_AUTO } from '@/app/composables/components-composables/useVfsMessageHooks'
import { vfsPersistenceStore } from '@/app/stores/vfs-store-singleton'
import { DeflateContentCodec } from '@/infra/serialization/deflate-codec'
import type { VfsSnapshot } from '@/domain/vfs/types'

const dispatchSpy = vi.fn()
const useVfsCommitActionsMock = vi.fn<(summary: string) => Promise<boolean>>()
const useVfsRollbackActionMock = vi.fn<(commitId: string) => Promise<boolean>>()
const useVfsBatchRollbackActionMock = vi.fn<(commitIds: string[]) => Promise<boolean>>()
const fetchLogsMock = vi.fn(async () => ({ items: [], total: 0 }))
let toastrErrorMock: ReturnType<typeof vi.fn>

const mountedWrappers: Array<{ unmount: () => void }> = []
function mountTracked<T>(...args: Parameters<typeof mount<T>>) {
  const wrapper = mount<T>(...args)
  mountedWrappers.push(wrapper)
  return wrapper
}

afterEach(() => {
  while (mountedWrappers.length) {
    mountedWrappers.pop()?.unmount()
  }
})

function getButtonByText(wrapper: ReturnType<typeof mount>, label: string) {
  const button = wrapper
    .findAll('button')
    .find((candidate) => candidate.text().trim().toLowerCase() === label.toLowerCase())
  if (!button) {
    throw new Error(`button "${label}" not found`)
  }
  return button
}

function getHeaderActionMenu(wrapper: ReturnType<typeof mount>) {
  const headerActions = wrapper.find('.vfs-fm-action-group')
  if (!headerActions.exists()) {
    throw new Error('file manager header action group not found')
  }
  const menu = headerActions.findComponent(VfsActionMenu)
  if (!menu.exists()) {
    throw new Error('header VfsActionMenu not found')
  }
  return menu
}

async function triggerEntityAction(wrapper: ReturnType<typeof mount>, action: string) {
  const selectedRow = wrapper.find('li.vfs-fm-row[data-selected="true"]')
  if (!selectedRow.exists()) {
    throw new Error('selected file manager row not found')
  }
  await selectedRow.get('summary.vfs-action-menu__toggle').trigger('click')
  await selectedRow.get(`[data-action="${action}"]`).trigger('click')
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

function decodeFileFromSnapshot(snapshot: VfsSnapshot, path: string): string {
  const node = Object.values(snapshot.nodes).find((candidate) => candidate.path === path)
  if (!node || node.type !== 'file') return ''
  return new DeflateContentCodec().decode(node.content)
}

async function selectTemplateFile(wrapper: ReturnType<typeof mount>) {
  const list = wrapper.get('[data-testid="vfs-file-manager-list"]')
  const candidates = list.findAll('button.vfs-fm-item')
  const fileButton = candidates.find((btn) => btn.text().includes('template.md'))
  if (!fileButton) {
    throw new Error('template.md not found')
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
  useVfsBatchRollbackAction: (commitIds: string[]) => useVfsBatchRollbackActionMock(commitIds),
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
    useVfsBatchRollbackActionMock.mockReset()
    useVfsBatchRollbackActionMock.mockResolvedValue(true)
    fetchLogsMock.mockClear()
    toastrErrorMock = vi.fn()
    ;(globalThis as { toastr: { error: (message: string) => void } }).toastr = { error: toastrErrorMock }
    const now = Date.now()
    const templateSnapshot = {
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
    }
    vfsPersistenceStore.updateExtension((draft) => ({
      ...draft,
      extensionTemplateVfsSnapshot: templateSnapshot,
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

  it('requires explicit destructive confirmation before template overwrite', async () => {
    const initial = JSON.stringify(vfsPersistenceStore.getState().chat.chatVfsSnapshot)
    const initialLogs = vfsPersistenceStore.getState().chat.chatVfsLogs.length
    const initialVersions = vfsPersistenceStore.getState().chat.chatVfsVersions.length
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const wrapper = mountTracked(VfsMainScreen)

    const overwriteButton = getButtonByText(wrapper, '模板覆盖当前目录')
    await overwriteButton.trigger('click')

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(vfsPersistenceStore.getState().chat.chatVfsSnapshot)).toBe(initial)
    expect(vfsPersistenceStore.getState().chat.chatVfsLogs.length).toBe(initialLogs)
    expect(vfsPersistenceStore.getState().chat.chatVfsVersions.length).toBe(initialVersions)
  })

  it('overwrites chat snapshot and resets chat logs/version history after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const wrapper = mountTracked(VfsMainScreen)

    const overwriteButton = getButtonByText(wrapper, '模板覆盖当前目录')
    await overwriteButton.trigger('click')

    const state = vfsPersistenceStore.getState()
    const template = state.extension.extensionTemplateVfsSnapshot
    expect(template).not.toBeNull()
    expect(state.chat.chatVfsSnapshot).toEqual(template)
    expect(state.chat.chatVfsLogs).toEqual([])
    expect(state.chat.chatVfsVersions).toEqual([])
    expect(state.chat.templateInitialized).toBe(true)
  })

  it('forces Tab1-only when mounted in template scope', async () => {
    const wrapper = mountTracked(VfsMainScreen, {
      props: {
        scope: 'template',
      },
    })

    // WHY: template scope exposes a single logical tab, so the header should be hidden.
    expect(wrapper.find('.vfs-tabs').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('文件管理器')
    expect(wrapper.text()).not.toContain('模板覆盖当前目录')
  })

  it('hides history and rollback controls in template mode editor', async () => {
    const wrapper = mountTracked(VfsMainScreen, {
      props: {
        scope: 'template',
      },
    })

    await selectTemplateFile(wrapper)
    await triggerEntityAction(wrapper, 'edit')
    expect(wrapper.find('textarea.vfs-editor').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('History')
    expect(wrapper.find('[data-testid="editor-history-rollback-list"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="editor-history-rollback-submit"]').exists()).toBe(false)
  })

  it('maps rollback success and failure to history events', async () => {
    const wrapper = mountTracked(VfsHistoryScreen)

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

    await wrapper.findComponent(VfsCommitTab).vm.$emit('rollback-status', {
      kind: 'batch',
      status: 'rollingBack',
      sourceVersionIds: ['commit-1', 'commit-2'],
    })
    expect(dispatchSpy).toHaveBeenCalledWith({ type: 'BATCH_ROLLBACK_REQUEST' })

    await wrapper.findComponent(VfsCommitTab).vm.$emit('rollback-status', {
      kind: 'batch',
      status: 'succeeded',
      sourceVersionIds: ['commit-1', 'commit-2'],
    })
    expect(dispatchSpy).toHaveBeenCalledWith({ type: 'BATCH_ROLLBACK_SUCCESS' })
  })

  it('guards runtime action triggering by entity kind', async () => {
    const wrapper = mountTracked(VfsActionMenu, {
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
    const wrapper = mountTracked(EditorScreen, {
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
    const wrapper = mountTracked(EditorScreen, {
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

  it('supports batch rollback selection flow in commit tab', async () => {
    const wrapper = mountTracked(VfsCommitTab, {
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

    const batchButtonBefore = wrapper.get('button')
    expect(batchButtonBefore.text()).toContain('批量回滚')
    expect(batchButtonBefore.attributes('disabled')).toBeDefined()

    const checks = wrapper.findAll('input[type="checkbox"]')
    expect(checks.length).toBeGreaterThan(1)
    await checks[0].setValue(true)
    await checks[1].setValue(true)
    await wrapper.get('button').trigger('click')

    expect(useVfsBatchRollbackActionMock).toHaveBeenCalledWith(['commit-1', 'commit-2'])
    expect(wrapper.emitted('rollbackStatus')?.[0]).toEqual([
      { kind: 'batch', status: 'rollingBack', sourceVersionIds: ['commit-1', 'commit-2'] },
    ])
    expect(wrapper.emitted('rollbackStatus')?.[1]).toEqual([
      { kind: 'batch', status: 'succeeded', sourceVersionIds: ['commit-1', 'commit-2'] },
    ])
  })

  it('switches between mobile and desktop layout modes', async () => {
    window.innerWidth = 375
    const wrapper = mountTracked(VfsMainScreen)
    expect(wrapper.get('[data-testid="vfs-main-layout"]').attributes('data-layout')).toBe('mobile')
    // WHY: files tab should be text-only to avoid duplicating the folder icon semantics with panel header.
    expect(wrapper.findAll('.vfs-tabs button')[0]?.text().trim()).toBe('文件管理')
    expect(wrapper.text()).not.toContain('文件管理器')

    window.innerWidth = 1366
    window.dispatchEvent(new Event('resize'))
    await wrapper.vm.$nextTick()

    expect(wrapper.get('[data-testid="vfs-main-layout"]').attributes('data-layout')).toBe('desktop')
    // WHY: Keep desktop behavior aligned with mobile for text-only files tab semantics.
    expect(wrapper.findAll('.vfs-tabs button')[0]?.text().trim()).toBe('文件管理')
    expect(wrapper.text()).not.toContain('文件管理器')
  })

  it('prompts before action-driven mode switch and keeps editor when cancelled', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const wrapper = mountTracked(VfsMainScreen)

    await selectDocsFile(wrapper)
    await triggerEntityAction(wrapper, 'edit')
    await wrapper.get('textarea.vfs-editor').setValue('unsaved draft')
    await triggerEntityAction(wrapper, 'view')

    expect(confirmSpy).toHaveBeenCalled()
    expect(wrapper.find('textarea.vfs-editor').exists()).toBe(true)
  })

  it('prompts before action-driven mode switch and discards draft on force leave', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const wrapper = mountTracked(VfsMainScreen)

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
    const wrapper = mountTracked(VfsMainScreen)

    await selectDocsFile(wrapper)
    await triggerEntityAction(wrapper, 'edit')
    await wrapper.get('textarea.vfs-editor').setValue('dirty content')
    await wrapper.get('.vfs-tabs button:nth-of-type(2)').trigger('click')

    expect(confirmSpy).toHaveBeenCalled()
    expect(wrapper.find('textarea.vfs-editor').exists()).toBe(true)
    expect(wrapper.get('[data-testid="vfs-main-layout"]').exists()).toBe(true)
  })

  it('wires editor save action to commit flow and appends commit record on success', async () => {
    const wrapper = mountTracked(VfsMainScreen)
    await selectDocsFile(wrapper)
    await triggerEntityAction(wrapper, 'edit')
    await wrapper.get('textarea.vfs-editor').setValue('new content')
    await wrapper.get('[data-testid="editor-save-submit"]').trigger('click')
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    const snapshot = vfsPersistenceStore.getState().chat.chatVfsSnapshot
    expect(decodeFileFromSnapshot(snapshot, '/docs/docs.md')).toBe('new content')
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

  it('persists edited content into extension template snapshot in template mode save', async () => {
    const wrapper = mountTracked(VfsMainScreen, {
      props: {
        scope: 'template',
      },
    })

    await selectTemplateFile(wrapper)
    await triggerEntityAction(wrapper, 'edit')
    await wrapper.get('textarea.vfs-editor').setValue('template updated')
    await wrapper.get('[data-testid="editor-save-submit"]').trigger('click')
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    const template = vfsPersistenceStore.getState().extension.extensionTemplateVfsSnapshot
    expect(template).not.toBeNull()
    expect(decodeFileFromSnapshot(template!, '/template.md')).toBe('template updated')
    // WHY: template mode is Tab1-only and should not append chat commit history.
    expect(useVfsCommitActionsMock).not.toHaveBeenCalled()
  })

  it('allows overlapping save and rollback requests and leaves resolution to execution result', async () => {
    let resolveSave: ((value: boolean) => void) | undefined
    useVfsCommitActionsMock.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveSave = resolve
      }),
    )

    const wrapper = mountTracked(VfsMainScreen)
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
    const wrapper = mountTracked(VfsMainScreen)
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
    const wrapper = mountTracked(VfsHistoryPanel)
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

  it('uses list-only layout on desktop and switches to preview grid when needed', async () => {
    window.innerWidth = 1366
    const wrapper = mountTracked(VfsMainScreen)
    // In list mode we intentionally render a single full-width file manager pane.
    expect(wrapper.get('[data-testid="vfs-list-only-layout"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="vfs-desktop-grid"]').exists()).toBe(false)

    await selectDocsFile(wrapper)
    await triggerEntityAction(wrapper, 'edit')
    expect(wrapper.find('textarea.vfs-editor').exists()).toBe(true)
    // Preview modes still use the desktop split grid path.
    expect(wrapper.get('[data-testid="vfs-desktop-grid"]').exists()).toBe(true)
    expect(getHeaderActionMenu(wrapper).exists()).toBe(true)
  })

  it('uses More dropdown semantics for Tab1 actions', async () => {
    const wrapper = mountTracked(VfsMainScreen)
    const menu = getHeaderActionMenu(wrapper)
    const toggle = menu.get('summary')
    expect(toggle.attributes('aria-label')).toBe('更多操作')
    expect(toggle.attributes('title')).toContain('更多操作')
    expect(menu.get('details.vfs-action-menu').exists()).toBe(true)
  })

  it('shows create-only actions in header menu without selection', async () => {
    const wrapper = mountTracked(VfsMainScreen)
    const menu = getHeaderActionMenu(wrapper)
    await menu.get('summary.vfs-action-menu__toggle').trigger('click')
    expect(menu.text()).toContain('新建目录')
    expect(menu.text()).toContain('新建文件')
    expect(menu.text()).not.toContain('查看')
    expect(menu.text()).not.toContain('编辑')
  })

  it('auto-selects row when row menu toggle is clicked', async () => {
    const wrapper = mountTracked(VfsMainScreen)
    const list = wrapper.get('[data-testid="vfs-file-manager-list"]')
    const docsRow = list.findAll('li.vfs-fm-row').find((row) => row.text().includes('docs'))
    if (!docsRow) throw new Error('docs row not found')
    await docsRow.get('summary.vfs-action-menu__toggle').trigger('click')
    expect(docsRow.attributes('data-selected')).toBe('true')
  })

  it('anchors row action menu as fixed overlay-right-bottom without parent layout shift', async () => {
    const wrapper = mountTracked(VfsMainScreen)
    const rowMenu = wrapper.findAllComponents(VfsActionMenu).find((menu) => menu.props('mode') === 'entity-actions')
    if (!rowMenu) throw new Error('entity row VfsActionMenu not found')

    const list = wrapper.get('[data-testid="vfs-file-manager-list"]')
    ;(list.element as HTMLElement).scrollTop = 24
    const listScrollBefore = (list.element as HTMLElement).scrollTop

    await rowMenu.get('summary.vfs-action-menu__toggle').trigger('click')

    const listScrollAfter = (list.element as HTMLElement).scrollTop
    const menuList = rowMenu.get('ul.vfs-action-menu__list')
    expect(menuList.classes()).toContain('vfs-action-menu__list--entity-overlay')
    expect(listScrollAfter).toBe(listScrollBefore)
  })

  it('keeps only one row menu open at a time', async () => {
    const wrapper = mountTracked(VfsFileManagerPanel, {
      props: {
        mode: 'list',
        currentPath: '/',
        selectedPath: null,
        entries: [
          { path: '/a.md', name: 'a.md', kind: 'file' },
          { path: '/b.md', name: 'b.md', kind: 'file' },
        ],
      },
      slots: {
        actions: '<div />',
      },
    })
    const rowMenus = wrapper.findAllComponents(VfsActionMenu).filter((menu) => menu.props('mode') === 'entity-actions')
    expect(rowMenus.length).toBeGreaterThan(1)

    await rowMenus[0]!.get('summary.vfs-action-menu__toggle').trigger('click')
    expect(rowMenus[0]!.get('details.vfs-action-menu').attributes('open')).toBeDefined()

    await rowMenus[1]!.get('summary.vfs-action-menu__toggle').trigger('click')
    expect(rowMenus[0]!.get('details.vfs-action-menu').attributes('open')).toBeUndefined()
    expect(rowMenus[1]!.get('details.vfs-action-menu').attributes('open')).toBeDefined()
  })

  it.each([
    { label: 'chat-desktop', scope: undefined, width: 1366 },
    { label: 'chat-mobile', scope: undefined, width: 375 },
    { label: 'template-desktop', scope: 'template' as const, width: 1366 },
    { label: 'template-mobile', scope: 'template' as const, width: 375 },
  ])('keeps row menu overlay stable without parent scroll shift in $label', async ({ scope, width }) => {
    window.innerWidth = width
    const wrapper = mountTracked(VfsMainScreen, scope ? { props: { scope } } : undefined)
    window.dispatchEvent(new Event('resize'))
    await wrapper.vm.$nextTick()

    const rowMenu = wrapper.findAllComponents(VfsActionMenu).find((menu) => menu.props('mode') === 'entity-actions')
    if (!rowMenu) throw new Error('entity row VfsActionMenu not found')

    const list = wrapper.get('[data-testid="vfs-file-manager-list"]')
    ;(list.element as HTMLElement).scrollTop = 24
    const listScrollBefore = (list.element as HTMLElement).scrollTop

    await rowMenu.get('summary.vfs-action-menu__toggle').trigger('click')
    const menuList = rowMenu.get('ul.vfs-action-menu__list')
    const listScrollAfter = (list.element as HTMLElement).scrollTop

    expect(menuList.classes()).toContain('vfs-action-menu__list--entity-overlay')
    expect(listScrollAfter).toBe(listScrollBefore)
  })

  it('blocks path-like names in create modal submit path', async () => {
    const wrapper = mountTracked(VfsMainScreen)
    const beforeSnapshot = JSON.stringify(vfsPersistenceStore.getState().chat.chatVfsSnapshot)
    await getHeaderActionMenu(wrapper).vm.$emit('global-action-selected', 'create-file')
    await wrapper.vm.$nextTick()

    await wrapper.findComponent(VfsCreateEntityModal).vm.$emit('confirm', 'nested/name')
    await wrapper.vm.$nextTick()

    expect(toastrErrorMock).toHaveBeenCalledWith('名称不能包含路径分隔符')
    expect(JSON.stringify(vfsPersistenceStore.getState().chat.chatVfsSnapshot)).toBe(beforeSnapshot)
  })

it('blocks relative segment "." in create modal submit path', async () => {
  const wrapper = mountTracked(VfsMainScreen)
  const beforeSnapshot = JSON.stringify(vfsPersistenceStore.getState().chat.chatVfsSnapshot)
  await getHeaderActionMenu(wrapper).vm.$emit('global-action-selected', 'create-file')
  await wrapper.vm.$nextTick()

  await wrapper.findComponent(VfsCreateEntityModal).vm.$emit('confirm', '.')
  await wrapper.vm.$nextTick()

  expect(toastrErrorMock).toHaveBeenCalledWith('名称不能为 . 或 ..')
  expect(JSON.stringify(vfsPersistenceStore.getState().chat.chatVfsSnapshot)).toBe(beforeSnapshot)
})

it('blocks relative segment ".." in create modal submit path', async () => {
  const wrapper = mountTracked(VfsMainScreen)
  const beforeSnapshot = JSON.stringify(vfsPersistenceStore.getState().chat.chatVfsSnapshot)
  await getHeaderActionMenu(wrapper).vm.$emit('global-action-selected', 'create-directory')
  await wrapper.vm.$nextTick()

  await wrapper.findComponent(VfsCreateEntityModal).vm.$emit('confirm', '..')
  await wrapper.vm.$nextTick()

  expect(toastrErrorMock).toHaveBeenCalledWith('名称不能为 . 或 ..')
  expect(JSON.stringify(vfsPersistenceStore.getState().chat.chatVfsSnapshot)).toBe(beforeSnapshot)
})

  it('maps create exceptions to user-visible reasons using real error details', async () => {
    const wrapper = mountTracked(VfsMainScreen)
    await getHeaderActionMenu(wrapper).vm.$emit('global-action-selected', 'create-directory')
    await wrapper.vm.$nextTick()

    await wrapper.findComponent(VfsCreateEntityModal).vm.$emit('confirm', 'docs')
    await wrapper.vm.$nextTick()

    const calls = toastrErrorMock.mock.calls
    const lastMessage = String(calls[calls.length - 1]?.[0] ?? '')
    expect(lastMessage).toContain('[E_RENAME_FAILED]')
    expect(lastMessage).toContain('Path already exists')
  })

  it('does not auto-fetch logs on tab enter (manual by default)', async () => {
    const wrapper = mountTracked(VfsMainScreen)
    await wrapper.get('.vfs-tabs button:nth-of-type(3)').trigger('click')
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    expect(fetchLogsMock).toHaveBeenCalledTimes(0)
  })

  it('triggers one auto log refresh when message event fires while Tab3 is open', async () => {
    const wrapper = mountTracked(VfsMainScreen)
    await wrapper.get('.vfs-tabs button:nth-of-type(3)').trigger('click')
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    window.dispatchEvent(new CustomEvent(VFS_LOG_REFRESH_AUTO))
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    expect(fetchLogsMock).toHaveBeenCalledTimes(1)
  })

  it('does not lose auto log refresh when message event fires while Tab3 is not active', async () => {
    const wrapper = mountTracked(VfsMainScreen)

    // Fire auto-refresh while still on Tab1 (files).
    window.dispatchEvent(new CustomEvent(VFS_LOG_REFRESH_AUTO))
    await Promise.resolve()
    await wrapper.vm.$nextTick()
    expect(fetchLogsMock).toHaveBeenCalledTimes(0)

    // Opening Tab3 should consume the pending refresh exactly once.
    await wrapper.get('.vfs-tabs button:nth-of-type(3)').trigger('click')
    await Promise.resolve()
    await wrapper.vm.$nextTick()
    expect(fetchLogsMock).toHaveBeenCalledTimes(1)
  })

  it('coalesces multiple inactive-tab auto refresh events into a single pending refresh', async () => {
    const wrapper = mountTracked(VfsMainScreen)

    window.dispatchEvent(new CustomEvent(VFS_LOG_REFRESH_AUTO))
    window.dispatchEvent(new CustomEvent(VFS_LOG_REFRESH_AUTO))
    await Promise.resolve()
    await wrapper.vm.$nextTick()
    expect(fetchLogsMock).toHaveBeenCalledTimes(0)

    await wrapper.get('.vfs-tabs button:nth-of-type(3)').trigger('click')
    await Promise.resolve()
    await wrapper.vm.$nextTick()
    expect(fetchLogsMock).toHaveBeenCalledTimes(1)
  })
})
