import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import VfsActionMenu from '@/app/components/business-components/VfsActionMenu.vue'
import VfsActionConfirmDialog from '@/app/components/business-components/VfsActionConfirmDialog.vue'
import VfsActionInputDialog from '@/app/components/business-components/VfsActionInputDialog.vue'
import VfsCreateEntityModal from '@/app/components/business-components/VfsCreateEntityModal.vue'
import VfsFileManagerPanel from '@/app/components/business-components/VfsFileManagerPanel.vue'
import VfsListboxField from '@/app/components/pure-components/VfsListboxField.vue'
import VfsHistoryScreen from '@/app/screens/business-screens/VfsHistoryScreen.vue'
import VfsMainScreen from '@/app/screens/business-screens/VfsMainScreen.vue'
import ReaderScreen from '@/app/screens/pure-screens/ReaderScreen.vue'
import VfsHistoryPanel from '@/app/components/business-components/VfsHistoryPanel.vue'
import { createVfsCommitHistoryStore } from '@/app/composables/components-composables/useVfsCommitHistory'
import { VFS_POPUP_BEFORE_CLOSE } from '@/app/composables/components-composables/useVfsMessageHooks'
import { vfsPersistenceStore } from '@/app/stores/vfs-store-singleton'
import { DeflateContentCodec } from '@/infra/serialization/deflate-codec'
import type { VfsSnapshot } from '@/domain/vfs/types'
import { splitYamlFrontMatter } from '@/domain/markdown/markdown-frontmatter'

const dispatchSpy = vi.fn()
const useVfsCheckpointRollbackMock = vi.fn<(checkpointId: string) => Promise<boolean>>()
let toastrErrorMock: ReturnType<typeof vi.fn>
let toastrSuccessMock: ReturnType<typeof vi.fn>

const mountedWrappers: Array<{ unmount: () => void }> = []
/** Flush Vue updates after opening menus so lifecycle hooks settle before outside-dismiss assertions. */
async function settleActionMenuOutsideBinding(): Promise<void> {
  await flushPromises()
  await nextTick()
}

async function flushActionMenuDom(): Promise<void> {
  await flushPromises()
  await nextTick()
}

async function ensureEditorSourceMode(wrapper: ReturnType<typeof mount>): Promise<void> {
  if (wrapper.find('textarea.vfs-editor').exists()) return
  await wrapper.get('[data-testid="editor-preview-toggle"]').trigger('click')
  await nextTick()
}

function requireEntityActionMenuPanel(): HTMLElement {
  const panel = document.querySelector('[data-testid="vfs-entity-action-menu-panel"]')
  if (!panel) {
    throw new Error('entity action menu panel not found')
  }
  return panel as HTMLElement
}
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

function getButtonByAriaLabel(wrapper: ReturnType<typeof mount>, label: string) {
  const button = wrapper.find(`button[aria-label="${label}"]`)
  if (!button.exists()) {
    throw new Error(`button aria-label "${label}" not found`)
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

async function triggerEntityAction(wrapper: ReturnType<typeof mount>, action: string, rowTextIncludes: string) {
  const list = wrapper.get('[data-testid="vfs-file-manager-list"]')
  const rows = list.findAll('li.vfs-fm-row')
  const targetRow = rows.find((row) => row.text().includes(rowTextIncludes))
  if (!targetRow) {
    throw new Error(`file manager row containing "${rowTextIncludes}" not found`)
  }
  await targetRow.get('summary.vfs-action-menu__toggle').trigger('click')
  await flushActionMenuDom()
  const panel = requireEntityActionMenuPanel()
  const actionButton = panel.querySelector(`[data-action="${action}"]`)
  if (!actionButton) {
    throw new Error(`entity action "${action}" not found`)
  }
  actionButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await flushActionMenuDom()
}

async function triggerHeaderAction(wrapper: ReturnType<typeof mount>, action: string): Promise<void> {
  const menu = getHeaderActionMenu(wrapper)
  await menu.get('summary.vfs-action-menu__toggle').trigger('click')
  await flushActionMenuDom()
  const actionButton = menu.find(`[data-action="${action}"]`)
  if (!actionButton.exists()) {
    throw new Error(`header action "${action}" not found`)
  }
  await actionButton.trigger('click')
  await flushActionMenuDom()
}

async function selectDocsFile(wrapper: ReturnType<typeof mount>) {
  const list = wrapper.get('[data-testid="vfs-file-manager-list"]')
  const candidates = list.findAll('button.vfs-fm-item')
  const docsDir = candidates.find((btn) => btn.text().includes('docs')) // directory at root
  if (!docsDir) {
    throw new Error('docs directory not found')
  }
  // WHY: directory rows now use single-click for navigation.
  await docsDir.trigger('click')
  await wrapper.vm.$nextTick()
}

function decodeFileFromSnapshot(snapshot: VfsSnapshot, path: string): string {
  const node = Object.values(snapshot.nodes).find((candidate) => candidate.path === path)
  if (!node || node.type !== 'file') return ''
  return new DeflateContentCodec().decode(node.content)
}

function getVisibleFileNames(wrapper: ReturnType<typeof mount>): string[] {
  const rows = wrapper.get('[data-testid="vfs-file-manager-list"]').findAll('li.vfs-fm-row')
  return rows
    .map((row) => row.find('.vfs-fm-name'))
    .filter((nameEl) => nameEl.exists())
    .map((nameEl) => nameEl.text().trim())
    .filter((name) => name.endsWith('.md'))
}

function getGutterLineTexts(wrapper: ReturnType<typeof mount>): string[] {
  return wrapper
    .findAll('.vfs-line-number-gutter__row')
    .map((row) => row.text())
    .filter((text) => text.length > 0)
}

async function selectTemplateFile(wrapper: ReturnType<typeof mount>) {
  await wrapper.vm.$nextTick()
  const list = wrapper.get('[data-testid="vfs-file-manager-list"]')
  const row = list.findAll('li.vfs-fm-row').find((candidate) => candidate.text().includes('template.md'))
  if (!row) {
    throw new Error('template.md row not found')
  }
}

vi.mock('@/app/composables/screens-composables/useVfsHistoryStateMachine', () => ({
  createVfsHistoryStateMachine: () => ({
    state: { status: 'idle' },
    dispatch: dispatchSpy,
  }),
}))

vi.mock('@/app/composables/components-composables/useVfsCheckpointRollback', () => ({
  useVfsCheckpointRollback: (checkpointId: string) => useVfsCheckpointRollbackMock(checkpointId),
}))

describe('vfs ui cr loop fixes', () => {
  let testSeedCheckpointId = ''
  beforeEach(async () => {
    window.innerWidth = 1366
    dispatchSpy.mockReset()
    useVfsCheckpointRollbackMock.mockReset()
    useVfsCheckpointRollbackMock.mockResolvedValue(true)
    toastrErrorMock = vi.fn()
    toastrSuccessMock = vi.fn()
    ;(globalThis as { toastr: { error: (message: string) => void; success: (message: string) => void } }).toastr = {
      error: toastrErrorMock,
      success: toastrSuccessMock,
    }
    const now = Date.now()
    const older = now - 10_000
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
            children: ['node-3', 'node-4'],
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
            mtime: older,
            ctime: older,
            updatedBy: 'user',
          },
          'node-4': {
            id: 'node-4',
            type: 'file',
            path: '/docs/other.md',
            name: 'other.md',
            parentId: 'node-2',
            size: 3,
            content: { encoding: 'plain', data: '# b', originalSize: 3 },
            mtime: now,
            ctime: now,
            updatedBy: 'user',
          },
        },
      },
      workTree: {
        schemaVersion: 2,
        fileInclusionByPath: { '/docs/docs.md': 'explicit-include' },
        directoryRuleByPath: {
          '/': { sortField: 'name', sortDirection: 'asc', headCount: 1000, tailCount: 0, fill: 'omit' },
          '/docs': { sortField: 'name', sortDirection: 'asc', headCount: 0, tailCount: 0, fill: 'omit' },
        },
        directoryRuleEnabledByPath: { '/docs': true },
      },
    }))
    const { vfsCheckpointService } = await import('@/app/stores/vfs-store-singleton')
    testSeedCheckpointId = vfsCheckpointService.appendCheckpointForPersistedTree('editor-save')
  })

  it('requires explicit destructive confirmation dialog before template overwrite', async () => {
    const initial = JSON.stringify(vfsPersistenceStore.getState().chat.chatVfsSnapshot)
    const initialLogs = vfsPersistenceStore.getState().chat.chatVfsLogs.length
    const initialCheckpoints = vfsPersistenceStore.getState().chat.vfsCheckpoints.length
    const wrapper = mountTracked(VfsMainScreen)

    const overwriteButton = getButtonByAriaLabel(wrapper, '覆盖')
    await overwriteButton.trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent(VfsActionConfirmDialog).exists()).toBe(true)
    await wrapper.findComponent(VfsActionConfirmDialog).vm.$emit('cancel')
    await wrapper.vm.$nextTick()

    expect(JSON.stringify(vfsPersistenceStore.getState().chat.chatVfsSnapshot)).toBe(initial)
    expect(vfsPersistenceStore.getState().chat.chatVfsLogs.length).toBe(initialLogs)
    expect(vfsPersistenceStore.getState().chat.vfsCheckpoints.length).toBe(initialCheckpoints)
  })

  it('overwrites chat snapshot and resets chat logs/version history after dialog confirm', async () => {
    const wrapper = mountTracked(VfsMainScreen)

    const overwriteButton = getButtonByAriaLabel(wrapper, '覆盖')
    await overwriteButton.trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper.findComponent(VfsActionConfirmDialog).vm.$emit('confirm')
    await wrapper.vm.$nextTick()

    const state = vfsPersistenceStore.getState()
    const template = state.extension.extensionTemplateVfsSnapshot
    expect(template).not.toBeNull()
    expect(state.chat.chatVfsSnapshot).toEqual(template)
    expect(state.chat.chatVfsLogs).toEqual([])
    expect(state.chat.vfsCheckpoints).toEqual([])
    expect(state.chat.templateInitialized).toBe(true)
  })

  it('replaces native prompt in rename flow with styled input dialog', async () => {
    const promptSpy = vi.spyOn(window, 'prompt')
    const wrapper = mountTracked(VfsMainScreen)
    await selectDocsFile(wrapper)
    await triggerEntityAction(wrapper, 'rename', 'docs.md')
    await wrapper.vm.$nextTick()

    expect(promptSpy).not.toHaveBeenCalled()
    expect(wrapper.findComponent(VfsActionInputDialog).exists()).toBe(true)
    await wrapper.findComponent(VfsActionInputDialog).vm.$emit('confirm', { name: 'renamed.md' })
    await wrapper.vm.$nextTick()

    const snapshot = vfsPersistenceStore.getState().chat.chatVfsSnapshot
    expect(Object.values(snapshot.nodes).some((node) => node.path === '/docs/renamed.md')).toBe(true)
  })

  it('renders row status icon before kebab with chinese a11y labels', async () => {
    const wrapper = mountTracked(VfsMainScreen)
    await selectDocsFile(wrapper)
    const row = wrapper.findAll('li.vfs-fm-row').find((candidate) => candidate.text().includes('docs.md'))
    if (!row) throw new Error('docs.md row not found')
    const status = row.get('[data-testid="vfs-fm-row-status"]')
    expect(status.attributes('title')).toBe('已纳入工作树')
    expect(status.attributes('aria-label')).toBe('状态：已纳入工作树')
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
    await triggerEntityAction(wrapper, 'open', 'template.md')
    expect(wrapper.find('.vfs-editor-screen').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('History')
    expect(wrapper.find('[data-testid="editor-snapshot-listbox-trigger"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="editor-history-rollback-submit"]').exists()).toBe(false)
  })

  it('history screen renders status chrome', async () => {
    const wrapper = mountTracked(VfsHistoryScreen)
    expect(wrapper.find('.vfs-history-status-bar').exists()).toBe(true)
  })

  it('guards runtime action triggering by entity kind', async () => {
    const wrapper = mountTracked(VfsActionMenu, {
      props: {
        entity: { id: 'file-1', name: 'a.md', kind: 'file', path: '/a.md' },
      },
    })

    expect(wrapper.text()).toContain('打开')
    expect(wrapper.text()).not.toContain('幻灯片/阅读模式')

    await wrapper.get('[data-action="open"]').trigger('click')
    expect(wrapper.emitted('actionSelected')?.[0]).toEqual(['open'])

    expect(wrapper.find('[data-action="open-slideshow"]').exists()).toBe(false)
  })

  it('stores structured commit history sorted by time desc', () => {
    const store = createVfsCommitHistoryStore()
    store.appendRecord({
      time: '2026-05-08T10:00:00.000Z',
      operator: 'assistant',
      actionType: 'editor-save',
      scope: '/docs',
      checkpointId: 'v1',
    })
    store.appendRecord({
      time: '2026-05-08T11:00:00.000Z',
      operator: 'assistant',
      actionType: 'tool-batch',
      scope: '/docs/a.md',
      checkpointId: 'v2',
    })

    expect(store.records.value[0]?.checkpointId).toBe('v2')
    expect(store.records.value[1]?.checkpointId).toBe('v1')
  })

  it('shows editor snapshot listbox in tabs strip and wires rollback to selected id', async () => {
    const wrapper = mountTracked(VfsMainScreen)
    await selectDocsFile(wrapper)
    await triggerEntityAction(wrapper, 'open', 'docs.md')
    await ensureEditorSourceMode(wrapper)

    expect(wrapper.find('select[data-testid="editor-snapshot-select"]').exists()).toBe(false)
    const left = wrapper.get('[data-testid="vfs-preview-top-bar-left"]')
    expect(left.find('[data-testid="vfs-preview-back"]').exists()).toBe(true)

    const toolbar = wrapper.get('[data-testid="editor-snapshot-toolbar-tabs"]')
    const trigger = wrapper.get('[data-testid="editor-snapshot-listbox-trigger"]')
    expect(toolbar.element.contains(trigger.element)).toBe(true)

    const listbox = wrapper.findComponent(VfsListboxField)
    expect(listbox.exists()).toBe(true)
    expect(listbox.props('options')?.length ?? 0).toBeGreaterThan(0)

    await listbox.vm.$emit('update:modelValue', 'testSeedCheckpointId')
    await nextTick()

    await wrapper.get('[data-testid="editor-history-rollback-submit"]').trigger('click')
    await flushPromises()
    await nextTick()

    expect(useVfsCheckpointRollbackMock).toHaveBeenCalledWith('testSeedCheckpointId')
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

  it('prompts before returning to list from dirty editor when cancelled', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    const wrapper = mountTracked(VfsMainScreen)

    await selectDocsFile(wrapper)
    await triggerEntityAction(wrapper, 'open', 'docs.md')
    await ensureEditorSourceMode(wrapper)
    await wrapper.get('textarea.vfs-editor').setValue('unsaved draft')
    confirmSpy.mockClear()
    await wrapper.get('[data-testid="vfs-preview-back"]').trigger('click')

    expect(wrapper.get('[data-testid="vfs-unsaved-editor-dialog"]').exists()).toBe(true)
    expect(confirmSpy).not.toHaveBeenCalled()
    await wrapper.get('[data-testid="vfs-unsaved-cancel"]').trigger('click')
    expect(wrapper.find('textarea.vfs-editor').exists()).toBe(true)
  })

  it('discards draft when leaving dirty editor via unsaved dialog', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    const wrapper = mountTracked(VfsMainScreen)

    await selectDocsFile(wrapper)
    await triggerEntityAction(wrapper, 'open', 'docs.md')
    await ensureEditorSourceMode(wrapper)
    await wrapper.get('textarea.vfs-editor').setValue('discard me')
    confirmSpy.mockClear()
    await wrapper.get('[data-testid="vfs-preview-back"]').trigger('click')

    expect(wrapper.get('[data-testid="vfs-unsaved-editor-dialog"]').exists()).toBe(true)
    expect(confirmSpy).not.toHaveBeenCalled()
    await wrapper.get('[data-testid="vfs-unsaved-discard"]').trigger('click')
    expect(wrapper.find('textarea.vfs-editor').exists()).toBe(false)

    await selectDocsFile(wrapper)
    await triggerEntityAction(wrapper, 'open', 'docs.md')
    await ensureEditorSourceMode(wrapper)
    // WHY: opening a file must always load its own content, not keep previous editor buffer.
    expect((wrapper.get('textarea.vfs-editor').element as HTMLTextAreaElement).value).toBe('# a')
  })

  it('prompts before tab switch and stays on files when cancelled', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    const wrapper = mountTracked(VfsMainScreen)

    await selectDocsFile(wrapper)
    await triggerEntityAction(wrapper, 'open', 'docs.md')
    await ensureEditorSourceMode(wrapper)
    await wrapper.get('textarea.vfs-editor').setValue('dirty content')
    confirmSpy.mockClear()
    await wrapper.get('.vfs-tabs button:nth-of-type(2)').trigger('click')

    expect(wrapper.get('[data-testid="vfs-unsaved-editor-dialog"]').exists()).toBe(true)
    expect(confirmSpy).not.toHaveBeenCalled()
    await wrapper.get('[data-testid="vfs-unsaved-cancel"]').trigger('click')
    expect(wrapper.find('textarea.vfs-editor').exists()).toBe(true)
    expect(wrapper.get('[data-testid="vfs-main-layout"]').exists()).toBe(true)
  })

  it('wires editor save action to persist snapshot content on success', async () => {
    const wrapper = mountTracked(VfsMainScreen)
    await selectDocsFile(wrapper)
    await triggerEntityAction(wrapper, 'open', 'docs.md')
    await ensureEditorSourceMode(wrapper)
    const beforeCheckpoints = vfsPersistenceStore.getState().chat.vfsCheckpoints.length
    await wrapper.get('textarea.vfs-editor').setValue('new content')
    await wrapper.get('[data-testid="editor-save-submit"]').trigger('click')
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    const snapshot = vfsPersistenceStore.getState().chat.chatVfsSnapshot
    const max = vfsPersistenceStore.getState().extension.snapshotMaxCount
    expect(vfsPersistenceStore.getState().chat.vfsCheckpoints.length).toBe(Math.min(beforeCheckpoints + 1, max))
    expect(decodeFileFromSnapshot(snapshot, '/docs/docs.md')).toBe('new content')
    expect(dispatchSpy).toHaveBeenCalledWith({ type: 'SAVE_REQUEST' })
    expect(dispatchSpy).toHaveBeenCalledWith({ type: 'SAVE_SUCCESS' })
    expect(toastrSuccessMock).toHaveBeenCalledWith('已保存')
    expect(wrapper.get('[data-testid="viewer-file-title"]').text()).toContain('docs.md')

    await wrapper.get('[data-testid="vfs-preview-back"]').trigger('click')
    await selectDocsFile(wrapper)
    await triggerEntityAction(wrapper, 'open', 'docs.md')
    expect(wrapper.find('.vfs-editor-screen').exists()).toBe(true)
    expect(wrapper.get('[data-testid="editor-preview-toggle"]').attributes('title')).toBe('查看源码')
    expect(wrapper.find('textarea.vfs-editor').exists()).toBe(false)
  })

  it('persists edited content into extension template snapshot in template mode save', async () => {
    const wrapper = mountTracked(VfsMainScreen, {
      props: {
        scope: 'template',
      },
    })

    await selectTemplateFile(wrapper)
    await triggerEntityAction(wrapper, 'open', 'template.md')
    await ensureEditorSourceMode(wrapper)
    await wrapper.get('textarea.vfs-editor').setValue('template updated')
    await wrapper.get('[data-testid="editor-save-submit"]').trigger('click')
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    const template = vfsPersistenceStore.getState().extension.extensionTemplateVfsSnapshot
    expect(template).not.toBeNull()
    expect(decodeFileFromSnapshot(template!, '/template.md')).toBe('template updated')
    expect(toastrSuccessMock).toHaveBeenCalledWith('已保存')
  })

  it('keeps unified top bar controls on one row without embedded editor toolbar', async () => {
    const wrapper = mountTracked(VfsMainScreen)
    await selectDocsFile(wrapper)
    await triggerEntityAction(wrapper, 'open', 'docs.md')
    expect(wrapper.get('[data-testid="vfs-preview-back"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="editor-preview-toggle"]').exists()).toBe(true)
    expect(wrapper.find('.vfs-preview-top-bar [data-testid="editor-save-submit"]').exists()).toBe(true)
    expect(wrapper.find('.vfs-editor-toolbar').exists()).toBe(false)
  })

  it.each([
    { label: 'chat-desktop', scope: undefined, width: 1366 },
    { label: 'chat-mobile', scope: undefined, width: 375 },
    { label: 'template-desktop', scope: 'template' as const, width: 1366 },
    { label: 'template-mobile', scope: 'template' as const, width: 375 },
  ])('keeps editor fill-height chain stable in %s', async ({ scope, width }) => {
    window.innerWidth = width
    const wrapper = mountTracked(VfsMainScreen, scope ? { props: { scope } } : undefined)
    window.dispatchEvent(new Event('resize'))
    await wrapper.vm.$nextTick()

    if (scope === 'template') await triggerEntityAction(wrapper, 'open', 'template.md')
    else {
      await selectDocsFile(wrapper)
      await triggerEntityAction(wrapper, 'open', 'docs.md')
    }
    await ensureEditorSourceMode(wrapper)

    // WHY: editor mode relies on flex/min-height chain instead of inline pixel heights.
    expect(wrapper.find('.vfs-editor-stage').exists()).toBe(true)
    expect(wrapper.find('.vfs-editor-screen').exists()).toBe(true)
    const textarea = wrapper.get('textarea.vfs-editor').element as HTMLTextAreaElement
    expect(textarea.style.height).toBe('')
    expect(window.getComputedStyle(textarea).resize).toBe('none')
  })

  it('sets editor textarea resize to none for flex fill layout', async () => {
    const wrapper = mountTracked(VfsMainScreen)
    await selectDocsFile(wrapper)
    await triggerEntityAction(wrapper, 'open', 'docs.md')
    await ensureEditorSourceMode(wrapper)
    const textarea = wrapper.get('textarea.vfs-editor').element as HTMLTextAreaElement
    expect(textarea.style.height).toBe('')
    expect(window.getComputedStyle(textarea).resize).toBe('none')
  })

  it('allows overlapping save and rollback requests and leaves resolution to execution result', async () => {
    let resolveRollback: ((value: boolean) => void) | undefined
    useVfsCheckpointRollbackMock.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveRollback = resolve
      }),
    )

    const wrapper = mountTracked(VfsMainScreen)
    await selectDocsFile(wrapper)
    await triggerEntityAction(wrapper, 'open', 'docs.md')
    await ensureEditorSourceMode(wrapper)
    await wrapper.get('textarea.vfs-editor').setValue('pending save')
    await wrapper.get('[data-testid="editor-save-submit"]').trigger('click')
    const listbox = wrapper.findComponent(VfsListboxField)
    await listbox.vm.$emit('update:modelValue', 'testSeedCheckpointId')
    await nextTick()
    await wrapper.get('[data-testid="editor-history-rollback-submit"]').trigger('click')

    expect(useVfsCheckpointRollbackMock).toHaveBeenCalledTimes(1)

    resolveRollback?.(true)
    await Promise.resolve()
    await wrapper.vm.$nextTick()
  })

  it('registers popup before-close guard in template scope', async () => {
    const wrapper = mountTracked(VfsMainScreen, { props: { scope: 'template' } })
    await wrapper.vm.$nextTick()
    await triggerEntityAction(wrapper, 'open', 'template.md')
    await ensureEditorSourceMode(wrapper)
    await wrapper.get('textarea.vfs-editor').setValue('dirty template')
    await flushPromises()
    await nextTick()

    const beforeCloseEvent = new CustomEvent(VFS_POPUP_BEFORE_CLOSE, { cancelable: true })
    const allowed = window.dispatchEvent(beforeCloseEvent)
    await flushPromises()
    await nextTick()

    expect(allowed).toBe(false)
    expect(wrapper.get('[data-testid="vfs-unsaved-editor-dialog"]').exists()).toBe(true)
  })

  it('applies dirty guard to popup-close exit event and cancels close when requested', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    const wrapper = mountTracked(VfsMainScreen)
    await selectDocsFile(wrapper)
    await triggerEntityAction(wrapper, 'open', 'docs.md')
    await ensureEditorSourceMode(wrapper)
    await wrapper.get('textarea.vfs-editor').setValue('unsaved by popup close')
    await flushPromises()
    await nextTick()
    confirmSpy.mockClear()
    const beforeCloseEvent = new CustomEvent(VFS_POPUP_BEFORE_CLOSE, { cancelable: true })
    const allowed = window.dispatchEvent(beforeCloseEvent)
    await flushPromises()
    await nextTick()

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(allowed).toBe(false)
    expect(wrapper.get('[data-testid="vfs-unsaved-editor-dialog"]').exists()).toBe(true)
    await wrapper.get('[data-testid="vfs-unsaved-cancel"]').trigger('click')
    expect(wrapper.find('[data-testid="vfs-unsaved-editor-dialog"]').exists()).toBe(false)
  })

  it('unsaved dialog save persists draft and returns to list (template)', async () => {
    const wrapper = mountTracked(VfsMainScreen, { props: { scope: 'template' } })
    await triggerEntityAction(wrapper, 'open', 'template.md')
    await ensureEditorSourceMode(wrapper)
    await wrapper.get('textarea.vfs-editor').setValue('dirty then save and leave')
    await flushPromises()
    await nextTick()

    await wrapper.get('[data-testid="vfs-preview-back"]').trigger('click')
    await nextTick()
    expect(wrapper.get('[data-testid="vfs-unsaved-editor-dialog"]').exists()).toBe(true)

    await wrapper.get('[data-testid="vfs-unsaved-save"]').trigger('click')
    await flushPromises()
    await nextTick()

    expect(wrapper.find('[data-testid="vfs-unsaved-editor-dialog"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="vfs-list-only-layout"]').exists()).toBe(true)
    const template = vfsPersistenceStore.getState().extension.extensionTemplateVfsSnapshot
    expect(template).not.toBeNull()
    expect(decodeFileFromSnapshot(template!, '/template.md')).toBe('dirty then save and leave')
  })

  it('disables rollback controls while rollback request is in progress', async () => {
    let resolveRollback: ((value: boolean) => void) | undefined
    useVfsCheckpointRollbackMock.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveRollback = resolve
      }),
    )
    const wrapper = mountTracked(VfsHistoryPanel)
    await wrapper.get('input').setValue('testSeedCheckpointId')
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

  it('uses list-only layout on desktop and full-width preview stack when editing', async () => {
    window.innerWidth = 1366
    const wrapper = mountTracked(VfsMainScreen)
    // In list mode we intentionally render a single full-width file manager pane.
    expect(wrapper.get('[data-testid="vfs-list-only-layout"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="vfs-desktop-grid"]').exists()).toBe(false)

    await selectDocsFile(wrapper)
    await triggerEntityAction(wrapper, 'open', 'docs.md')
    expect(wrapper.find('.vfs-editor-screen').exists()).toBe(true)
    expect(wrapper.get('[data-testid="vfs-preview-stack"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="vfs-desktop-grid"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="vfs-preview-back"]').exists()).toBe(true)
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
    expect(menu.text()).toContain('目录纳入规则')
    expect(menu.text()).not.toContain('查看')
    expect(menu.text()).not.toContain('编辑')
  })

  it('shows directory rule action in header at root and under /docs; file rows omit apply-strategy', async () => {
    const wrapper = mountTracked(VfsMainScreen)
    const headerMenu = getHeaderActionMenu(wrapper)
    await headerMenu.get('summary.vfs-action-menu__toggle').trigger('click')
    expect(headerMenu.find('[data-action="apply-strategy"]').exists()).toBe(true)
    await flushActionMenuDom()

    await selectDocsFile(wrapper)
    await headerMenu.get('summary.vfs-action-menu__toggle').trigger('click')
    expect(headerMenu.find('[data-action="apply-strategy"]').exists()).toBe(true)
    await flushActionMenuDom()

    const row = wrapper.findAll('li.vfs-fm-row').find((candidate) => candidate.text().includes('docs.md'))
    if (!row) throw new Error('docs.md row not found')
    await row.get('summary.vfs-action-menu__toggle').trigger('click')
    await flushActionMenuDom()
    const panel = requireEntityActionMenuPanel()
    expect(panel.querySelector('[data-action="apply-strategy"]')).toBeNull()
  })

  it('renders strategy dialog controls with custom listbox semantics', async () => {
    const wrapper = mountTracked(VfsMainScreen)
    await selectDocsFile(wrapper)
    await triggerHeaderAction(wrapper, 'apply-strategy')
    await nextTick()

    const sortField = wrapper.get('[data-testid="vfs-action-input-sortField"]')
    const sortDirection = wrapper.get('[data-testid="vfs-action-input-sortDirection"]')
    const fill = wrapper.get('[data-testid="vfs-action-input-fill"]')
    expect(sortField.attributes('role')).toBe('combobox')
    expect(sortDirection.attributes('role')).toBe('combobox')
    expect(fill.attributes('role')).toBe('combobox')
    await sortField.trigger('click')
    await nextTick()
    expect(wrapper.get('[data-testid="vfs-action-input-sortField-listbox"]').text()).toContain('文件名称')
    await sortField.trigger('click')
    await nextTick()
    expect(wrapper.find('[data-testid="vfs-action-input-sortField-listbox"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="vfs-action-input-headCount-range"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="vfs-action-input-tailCount-range"]').exists()).toBe(true)
  })

  it('re-sorts current directory list immediately after strategy confirm', async () => {
    const wrapper = mountTracked(VfsMainScreen)
    await selectDocsFile(wrapper)
    expect(getVisibleFileNames(wrapper)).toEqual(['docs.md', 'other.md'])

    await triggerHeaderAction(wrapper, 'apply-strategy')
    await nextTick()
    await wrapper.findComponent(VfsActionInputDialog).vm.$emit('confirm', {
      sortField: 'name',
      sortDirection: 'desc',
      headCount: '0',
      tailCount: '0',
      fill: 'omit',
    })
    await nextTick()

    expect(getVisibleFileNames(wrapper)).toEqual(['other.md', 'docs.md'])
  })

  it('supports listbox keyboard flow and commit via Enter', async () => {
    const wrapper = mountTracked(VfsMainScreen)
    await selectDocsFile(wrapper)
    await triggerHeaderAction(wrapper, 'apply-strategy')
    await nextTick()

    const trigger = wrapper.get('[data-testid="vfs-action-input-sortDirection"]')
    await trigger.trigger('keydown', { key: 'ArrowDown' })
    await nextTick()
    expect(wrapper.find('[data-testid="vfs-action-input-sortDirection-listbox"]').exists()).toBe(true)
    await trigger.trigger('keydown', { key: 'ArrowDown' })
    await trigger.trigger('keydown', { key: 'Enter' })
    await nextTick()
    expect(wrapper.find('[data-testid="vfs-action-input-sortDirection-listbox"]').exists()).toBe(false)
    expect(vfsPersistenceStore.getState().chat.workTree?.directoryRuleByPath['/docs']?.sortDirection).toBe('desc')
  })

  it('closes open listbox on outside click without breaking dialog', async () => {
    const wrapper = mountTracked(VfsMainScreen, { attachTo: document.body })
    await selectDocsFile(wrapper)
    await triggerHeaderAction(wrapper, 'apply-strategy')
    await nextTick()

    const trigger = wrapper.get('[data-testid="vfs-action-input-fill"]')
    await trigger.trigger('click')
    await nextTick()
    expect(wrapper.find('[data-testid="vfs-action-input-fill-listbox"]').exists()).toBe(true)

    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await nextTick()
    expect(wrapper.find('[data-testid="vfs-action-input-fill-listbox"]').exists()).toBe(false)
    expect(wrapper.findComponent(VfsActionInputDialog).exists()).toBe(true)
  })

  it('clamps strategy numeric values and persists to chat scope only', async () => {
    const wrapper = mountTracked(VfsMainScreen)
    await selectDocsFile(wrapper)
    await triggerHeaderAction(wrapper, 'apply-strategy')
    await nextTick()

    await wrapper.findComponent(VfsActionInputDialog).vm.$emit('confirm', {
      sortField: 'mtime',
      sortDirection: 'desc',
      headCount: '2000',
      tailCount: '-12',
      fill: 'frontmatter',
    })
    await nextTick()

    const state = vfsPersistenceStore.getState()
    expect(state.chat.workTree?.directoryRuleByPath['/docs']).toEqual({
      sortField: 'mtime',
      sortDirection: 'desc',
      headCount: 1000,
      tailCount: 0,
      fill: 'frontmatter',
    })
    expect(state.chat.workTree?.directoryRuleEnabledByPath['/docs']).toBe(true)
    expect(state.extension.workTreeTemplate).toBeNull()
  })

  it('keeps strategy persistence isolated between chat and template scopes', async () => {
    const templateWrapper = mountTracked(VfsMainScreen, { props: { scope: 'template' } })
    await templateWrapper.findComponent(VfsFileManagerPanel).vm.$emit('opened', '/docs')
    await nextTick()
    await triggerHeaderAction(templateWrapper, 'apply-strategy')
    await nextTick()
    await templateWrapper.findComponent(VfsActionInputDialog).vm.$emit('confirm', {
      sortField: 'ctime',
      sortDirection: 'asc',
      headCount: '8',
      tailCount: '5',
      fill: 'filename',
    })
    await nextTick()

    const state = vfsPersistenceStore.getState()
    expect(state.extension.workTreeTemplate?.directoryRuleByPath['/docs']).toEqual({
      sortField: 'ctime',
      sortDirection: 'asc',
      headCount: 8,
      tailCount: 5,
      fill: 'filename',
    })
    expect(state.chat.workTree?.directoryRuleByPath['/docs']).toEqual({
      sortField: 'name',
      sortDirection: 'asc',
      headCount: 0,
      tailCount: 0,
      fill: 'omit',
    })
  })

  it('opens directory by single click and file by double-click into preview editor', async () => {
    const wrapper = mountTracked(VfsMainScreen)
    const list = wrapper.get('[data-testid="vfs-file-manager-list"]')
    const docsDir = list.findAll('button.vfs-fm-item').find((btn) => btn.text().includes('docs'))
    if (!docsDir) throw new Error('docs directory not found')
    await docsDir.trigger('click')
    await nextTick()

    const docsFile = wrapper
      .get('[data-testid="vfs-file-manager-list"]')
      .findAll('button.vfs-fm-item')
      .find((btn) => btn.text().includes('docs.md'))
    if (!docsFile) throw new Error('docs.md row not found')
    await docsFile.trigger('dblclick')
    await nextTick()

    expect(wrapper.find('.vfs-editor-screen').exists()).toBe(true)
    expect(wrapper.get('[data-testid="editor-preview-toggle"]').attributes('title')).toBe('查看源码')
  })

  it('loads correct file content when opening different files (no shared editor buffer)', async () => {
    const wrapper = mountTracked(VfsMainScreen)
    await selectDocsFile(wrapper)

    await triggerEntityAction(wrapper, 'open', 'docs.md')
    await ensureEditorSourceMode(wrapper)
    expect((wrapper.get('textarea.vfs-editor').element as HTMLTextAreaElement).value).toBe('# a')

    await wrapper.get('[data-testid="vfs-preview-back"]').trigger('click')
    await nextTick()

    await triggerEntityAction(wrapper, 'open', 'other.md')
    await ensureEditorSourceMode(wrapper)
    expect((wrapper.get('textarea.vfs-editor').element as HTMLTextAreaElement).value).toBe('# b')
  })

  it('shows unified viewer toolbar actions for file open entry', async () => {
    const wrapper = mountTracked(VfsMainScreen)
    await selectDocsFile(wrapper)
    await triggerEntityAction(wrapper, 'open', 'docs.md')

    expect(wrapper.get('[data-testid="vfs-preview-back"]').attributes('title')).toBe('返回')
    expect(wrapper.get('[data-testid="editor-preview-toggle"]').attributes('title')).toBe('查看源码')
    expect(wrapper.get('[data-testid="slideshow-prev-page"]').attributes('title')).toBe('Prev')
    expect(wrapper.get('[data-testid="slideshow-next-page"]').attributes('title')).toBe('Next')
    expect(wrapper.find('.vfs-preview-top-bar [data-testid="editor-save-submit"]').exists()).toBe(true)
  })

  it('renders preview metadata and typography shell for reader content', async () => {
    const wrapper = mountTracked(VfsMainScreen)
    await selectDocsFile(wrapper)
    await triggerEntityAction(wrapper, 'open', 'docs.md')

    const title = wrapper.get('[data-testid="viewer-file-title"]')
    expect(title.text()).toContain('docs.md')
    expect(title.classes()).toContain('vfs-preview-file-title')

    const metadata = wrapper.get('[data-testid="vfs-preview-meta"]')
    expect(metadata.text()).toContain('创建:')
    expect(metadata.text()).toContain('更新:')
    expect(metadata.text()).toContain('字数:')
    expect(wrapper.get('[data-testid="vfs-preview-meta-char-count"]').text()).toMatch(/字数:\s*\d+/)

    const frame = wrapper.get('[data-testid="vfs-preview-content-frame"]')
    expect(frame.classes()).toContain('vfs-preview-content-frame')
    expect(frame.find('.vfs-editor-screen').exists()).toBe(true)

    const readerWrapper = mountTracked(ReaderScreen, {
      props: {
        html: '# Heading\n\nA very long line without spaces '.repeat(8),
        filePath: '/x.md',
      },
    })
    const reader = readerWrapper.get('.vfs-reader')
    expect(window.getComputedStyle(reader.element).maxWidth).toBe('none')
    expect(reader.classes()).toContain('vfs-reader')
  })

  it('anchors preview metadata to content frame bottom-right', async () => {
    const wrapper = mountTracked(VfsMainScreen)
    await selectDocsFile(wrapper)
    await triggerEntityAction(wrapper, 'open', 'docs.md')

    const frame = wrapper.get('[data-testid="vfs-preview-content-frame"]')
    const meta = wrapper.get('[data-testid="vfs-preview-meta"]')
    expect(frame.classes()).toContain('vfs-preview-content-frame')
    expect(frame.classes()).toContain('vfs-preview-content-frame--meta-anchored')
    expect(meta.classes()).toContain('vfs-preview-meta')
    expect(meta.element.parentElement).toBe(frame.element)
  })

  it('falls back metadata placement when preview space is narrow and short', async () => {
    window.innerWidth = 900
    window.innerHeight = 620
    window.dispatchEvent(new Event('resize'))
    const wrapper = mountTracked(VfsMainScreen)
    await selectDocsFile(wrapper)
    await triggerEntityAction(wrapper, 'open', 'docs.md')

    const frame = wrapper.get('[data-testid="vfs-preview-content-frame"]')
    const meta = wrapper.get('[data-testid="vfs-preview-meta"]')
    expect(frame.classes()).toContain('vfs-preview-content-frame')
    expect(frame.classes()).not.toContain('vfs-preview-content-frame--meta-anchored')
    expect(frame.classes()).toContain('vfs-preview-content-frame--meta-flow')
    expect(meta.classes()).toContain('vfs-preview-meta')
    expect(meta.classes()).toContain('vfs-preview-meta--flow')
  })

  it('renders localized datetime values (not labels only) in preview metadata', async () => {
    const now = Date.now()
    const older = now - 10_000
    const expectedCreated = new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(older)
    const expectedUpdated = new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(older)
    const wrapper = mountTracked(VfsMainScreen)
    await selectDocsFile(wrapper)
    await triggerEntityAction(wrapper, 'open', 'docs.md')

    const createdText = wrapper.get('[data-testid="vfs-preview-meta-created"]').text()
    const updatedText = wrapper.get('[data-testid="vfs-preview-meta-updated"]').text()

    expect(createdText).toContain(expectedCreated)
    expect(updatedText).toContain(expectedUpdated)
    expect(createdText.replace('创建:', '').trim()).not.toBe('—')
    expect(updatedText.replace('更新:', '').trim()).not.toBe('—')
  })

  it('preview footer character count excludes YAML front matter', async () => {
    const fmDoc = '---\na: 1\n---\n# Hello\n\nX'
    vfsPersistenceStore.updateChat((draft) => {
      const node = draft.chatVfsSnapshot.nodes['node-3']
      if (!node || node.type !== 'file') return draft
      return {
        ...draft,
        chatVfsSnapshot: {
          ...draft.chatVfsSnapshot,
          nodes: {
            ...draft.chatVfsSnapshot.nodes,
            'node-3': {
              ...node,
              size: fmDoc.length,
              content: { encoding: 'plain', data: fmDoc, originalSize: fmDoc.length },
            },
          },
        },
      }
    })
    const wrapper = mountTracked(VfsMainScreen)
    await selectDocsFile(wrapper)
    await triggerEntityAction(wrapper, 'open', 'docs.md')
    await nextTick()

    const expected = splitYamlFrontMatter(fmDoc).body.length
    expect(wrapper.get('[data-testid="vfs-preview-meta-char-count"]').text()).toContain(`字数: ${expected}`)
  })

  it('keeps metadata visibility parity: preview hides gutter, source edit shows gutter', async () => {
    const wrapper = mountTracked(VfsMainScreen)
    await selectDocsFile(wrapper)
    await triggerEntityAction(wrapper, 'open', 'docs.md')
    await nextTick()

    expect(wrapper.find('[data-testid="vfs-preview-meta"]').exists()).toBe(true)
    expect(getGutterLineTexts(wrapper)).toEqual([])

    await wrapper.get('[data-testid="editor-preview-toggle"]').trigger('click')
    await nextTick()

    expect(wrapper.find('[data-testid="vfs-preview-meta"]').exists()).toBe(false)
    expect(getGutterLineTexts(wrapper)).toEqual(['1'])
  })

  it('keeps line numbers continuous after save then rollback rerender', async () => {
    const wrapper = mountTracked(VfsMainScreen)
    await selectDocsFile(wrapper)
    await triggerEntityAction(wrapper, 'open', 'docs.md')
    await ensureEditorSourceMode(wrapper)

    await wrapper.get('textarea.vfs-editor').setValue('line-1\nline-2\nline-3\nline-4')
    await wrapper.get('[data-testid="editor-save-submit"]').trigger('click')
    await flushPromises()
    await nextTick()
    expect(getGutterLineTexts(wrapper)).toEqual(['1', '2', '3', '4'])

    useVfsCheckpointRollbackMock.mockImplementationOnce(async () => {
      vfsPersistenceStore.updateChat((draft) => ({
        ...draft,
        chatVfsSnapshot: {
          ...draft.chatVfsSnapshot,
          nodes: {
            ...draft.chatVfsSnapshot.nodes,
            'node-3': {
              ...draft.chatVfsSnapshot.nodes['node-3'],
              size: 'restored\ncontent'.length,
              content: { encoding: 'plain', data: 'restored\ncontent', originalSize: 'restored\ncontent'.length },
            },
          },
        },
      }))
      return true
    })

    const listbox = wrapper.findComponent(VfsListboxField)
    await listbox.vm.$emit('update:modelValue', 'testSeedCheckpointId')
    await nextTick()
    await wrapper.get('[data-testid="editor-history-rollback-submit"]').trigger('click')
    await flushPromises()
    await nextTick()

    expect(getGutterLineTexts(wrapper)).toEqual(['1', '2'])
  })

  it('uses one shared preview surface across reader/editor/slideshow panels', async () => {
    const wrapper = mountTracked(VfsMainScreen)
    await selectDocsFile(wrapper)
    await triggerEntityAction(wrapper, 'open', 'docs.md')
    await nextTick()

    expect(wrapper.get('[data-vfs-preview-surface="shared"]').exists()).toBe(true)
    expect(wrapper.find('.vfs-editor-stage').exists()).toBe(true)
    expect(wrapper.find('.vfs-reader').exists()).toBe(true)

    await wrapper.get('[data-testid="editor-preview-toggle"]').trigger('click')
    await nextTick()
    expect(wrapper.get('[data-vfs-preview-surface="shared"]').exists()).toBe(true)
    expect(wrapper.find('textarea.vfs-editor').exists()).toBe(true)
    expect(wrapper.find('[data-testid="vfs-preview-meta"]').exists()).toBe(false)

    const slideshowWrapper = mountTracked(VfsMainScreen)
    await triggerEntityAction(slideshowWrapper, 'open-slideshow', 'docs')
    await nextTick()
    expect(slideshowWrapper.get('[data-vfs-preview-surface="shared"]').exists()).toBe(true)
    expect(slideshowWrapper.find('.vfs-editor-stage').exists()).toBe(true)
  })

  it('navigates Prev/Next only within current directory files', async () => {
    const wrapper = mountTracked(VfsMainScreen)
    await selectDocsFile(wrapper)
    await triggerEntityAction(wrapper, 'open', 'docs.md')

    expect(wrapper.get('[data-testid="slideshow-prev-page"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="slideshow-next-page"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.get('[data-testid="viewer-file-title"]').text()).toContain('docs.md')

    await wrapper.get('[data-testid="slideshow-next-page"]').trigger('click')
    await nextTick()
    await ensureEditorSourceMode(wrapper)
    expect((wrapper.get('textarea.vfs-editor').element as HTMLTextAreaElement).value).toBe('# b')
    expect(wrapper.get('[data-testid="slideshow-next-page"]').attributes('disabled')).toBeDefined()

    await wrapper.get('[data-testid="slideshow-prev-page"]').trigger('click')
    await nextTick()
    await ensureEditorSourceMode(wrapper)
    expect((wrapper.get('textarea.vfs-editor').element as HTMLTextAreaElement).value).toBe('# a')
  })

  it('restores directory origin context when back from open-slideshow entry', async () => {
    const wrapper = mountTracked(VfsMainScreen)
    await triggerEntityAction(wrapper, 'open-slideshow', 'docs')
    expect(wrapper.get('[data-testid="vfs-preview-stack"]').exists()).toBe(true)

    await wrapper.get('[data-testid="vfs-preview-back"]').trigger('click')
    await nextTick()

    expect(wrapper.get('[data-testid="vfs-list-only-layout"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('/')
    expect(wrapper.text()).toContain('docs')
  })

  it('restores file-open origin context when back from unified viewer', async () => {
    const wrapper = mountTracked(VfsMainScreen)
    await selectDocsFile(wrapper)
    await triggerEntityAction(wrapper, 'open', 'other.md')
    expect(wrapper.get('[data-testid="vfs-preview-stack"]').exists()).toBe(true)

    await wrapper.get('[data-testid="vfs-preview-back"]').trigger('click')
    await nextTick()

    expect(wrapper.get('[data-testid="vfs-list-only-layout"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('/docs')
    expect(wrapper.text()).toContain('other.md')
  })

  it('applies row menu entity actions without relying on list selection state', async () => {
    const wrapper = mountTracked(VfsMainScreen)
    await selectDocsFile(wrapper)
    await triggerEntityAction(wrapper, 'open', 'docs.md')
    expect(wrapper.find('.vfs-editor-screen').exists()).toBe(true)
  })

  it('anchors row entity menu with fixed teleported overlay without shifting parent scroll', async () => {
    const wrapper = mountTracked(VfsMainScreen)
    const rowMenu = wrapper.findAllComponents(VfsActionMenu).find((menu) => menu.props('mode') === 'entity-actions')
    if (!rowMenu) throw new Error('entity row VfsActionMenu not found')

    const list = wrapper.get('[data-testid="vfs-file-manager-list"]')
    ;(list.element as HTMLElement).scrollTop = 24
    const listScrollBefore = (list.element as HTMLElement).scrollTop

    await rowMenu.get('summary.vfs-action-menu__toggle').trigger('click')
    await flushActionMenuDom()

    const listScrollAfter = (list.element as HTMLElement).scrollTop
    const menuList = requireEntityActionMenuPanel()
    expect(menuList.classList.contains('vfs-action-menu__list')).toBe(true)
    expect(menuList.style.position).toBe('fixed')
    expect(listScrollAfter).toBe(listScrollBefore)
  })

  it('does not change list scrollHeight or scrollTop when toggling row entity menu (teleported panel)', async () => {
    const entries = Array.from({ length: 36 }, (_, index) => ({
      path: `/f${index}.md`,
      name: `file-${index}.md`,
      kind: 'file' as const,
    }))
    const wrapper = mountTracked(VfsFileManagerPanel, {
      attachTo: document.body,
      props: {
        mode: 'list',
        currentPath: '/',
        entries,
      },
      slots: {
        actions: '<div />',
      },
    })
    const list = wrapper.get('[data-testid="vfs-file-manager-list"]').element as HTMLElement
    list.style.maxHeight = '140px'
    list.style.overflow = 'auto'

    const rowMenus = wrapper.findAllComponents(VfsActionMenu).filter((menu) => menu.props('mode') === 'entity-actions')
    expect(rowMenus.length).toBeGreaterThan(0)

    const beforeHeight = list.scrollHeight
    list.scrollTop = 48
    const beforeTop = list.scrollTop

    await rowMenus[0]!.get('summary.vfs-action-menu__toggle').trigger('click')
    await flushActionMenuDom()
    expect(list.scrollHeight).toBe(beforeHeight)
    expect(list.scrollTop).toBe(beforeTop)

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()

    await rowMenus[0]!.get('summary.vfs-action-menu__toggle').trigger('click')
    await flushActionMenuDom()
    expect(list.scrollHeight).toBe(beforeHeight)
    expect(list.scrollTop).toBe(beforeTop)
  })

  it('keeps only one row menu open at a time', async () => {
    const wrapper = mountTracked(VfsFileManagerPanel, {
      attachTo: document.body,
      props: {
        mode: 'list',
        currentPath: '/',
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

  it('teleports zero entity action panels when all row menus are closed, and one when a row is open', async () => {
    const wrapper = mountTracked(VfsFileManagerPanel, {
      attachTo: document.body,
      props: {
        mode: 'list',
        currentPath: '/',
        entries: [
          { path: '/a.md', name: 'a.md', kind: 'file' },
          { path: '/b.md', name: 'b.md', kind: 'file' },
        ],
      },
      slots: {
        actions: '<div />',
      },
    })
    expect(document.querySelectorAll('[data-testid="vfs-entity-action-menu-panel"]')).toHaveLength(0)

    const rowMenus = wrapper.findAllComponents(VfsActionMenu).filter((menu) => menu.props('mode') === 'entity-actions')
    await rowMenus[0]!.get('summary.vfs-action-menu__toggle').trigger('click')
    await flushActionMenuDom()
    expect(document.querySelectorAll('[data-testid="vfs-entity-action-menu-panel"]')).toHaveLength(1)

    await settleActionMenuOutsideBinding()
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()
    await flushActionMenuDom()
    expect(document.querySelectorAll('[data-testid="vfs-entity-action-menu-panel"]')).toHaveLength(0)
  })

  it.each([
    { label: 'chat-desktop', scope: undefined, width: 1366 },
    { label: 'chat-mobile', scope: undefined, width: 375 },
    { label: 'template-desktop', scope: 'template' as const, width: 1366 },
    { label: 'template-mobile', scope: 'template' as const, width: 375 },
  ])('keeps row menu dropdown stable without parent scroll shift in $label', async ({ scope, width }) => {
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
    await flushActionMenuDom()
    const menuList = requireEntityActionMenuPanel()
    const listScrollAfter = (list.element as HTMLElement).scrollTop

    expect(menuList.classList.contains('vfs-action-menu__list')).toBe(true)
    expect(menuList.style.position).toBe('fixed')
    expect(listScrollAfter).toBe(listScrollBefore)
  })

  it.each([
    { label: 'chat-mobile', scope: undefined, width: 375 },
    { label: 'chat-desktop', scope: undefined, width: 1366 },
    { label: 'template-mobile', scope: 'template' as const, width: 375 },
    { label: 'template-desktop', scope: 'template' as const, width: 1366 },
  ])('does not force-toggle row menu closed on repeated toggle clicks ($label)', async ({ scope, width }) => {
    window.innerWidth = width
    const wrapper = mountTracked(VfsMainScreen, scope ? { props: { scope } } : undefined)
    window.dispatchEvent(new Event('resize'))
    await wrapper.vm.$nextTick()

    const rowMenu = wrapper.findAllComponents(VfsActionMenu).find((menu) => menu.props('mode') === 'entity-actions')
    if (!rowMenu) throw new Error('entity row VfsActionMenu not found')
    const details = rowMenu.get('details.vfs-action-menu')
    const toggle = rowMenu.get('summary.vfs-action-menu__toggle')

    for (let i = 0; i < 20; i += 1) {
      await toggle.trigger('click')
      expect(details.attributes('open')).toBeDefined()
    }
  })

  it.each([
    { label: 'chat', scope: undefined },
    { label: 'template', scope: 'template' as const },
  ])('dismisses row menu on outside click in $label scope', async ({ scope }) => {
    const wrapper = mountTracked(VfsMainScreen, scope ? { props: { scope } } : undefined)
    const rowMenu = wrapper.findAllComponents(VfsActionMenu).find((menu) => menu.props('mode') === 'entity-actions')
    if (!rowMenu) throw new Error('entity row VfsActionMenu not found')

    const list = wrapper.get('[data-testid="vfs-file-manager-list"]')
    ;(list.element as HTMLElement).scrollTop = 24
    const listScrollBefore = (list.element as HTMLElement).scrollTop

    const details = rowMenu.get('details.vfs-action-menu')
    await rowMenu.get('summary.vfs-action-menu__toggle').trigger('click')
    expect(details.attributes('open')).toBeDefined()
    await settleActionMenuOutsideBinding()

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(details.attributes('open')).toBeUndefined()

    const listScrollAfter = (list.element as HTMLElement).scrollTop
    expect(listScrollAfter).toBe(listScrollBefore)
  })

  it.each([
    { label: 'chat-mobile', scope: undefined, width: 375 },
    { label: 'chat-desktop', scope: undefined, width: 1366 },
    { label: 'template-mobile', scope: 'template' as const, width: 375 },
    { label: 'template-desktop', scope: 'template' as const, width: 1366 },
  ])('AC-1: row menu open → outside dismiss → reopen stays stable ($label)', async ({ scope, width }) => {
    window.innerWidth = width
    const wrapper = mountTracked(VfsMainScreen, scope ? { props: { scope } } : undefined)
    window.dispatchEvent(new Event('resize'))
    await wrapper.vm.$nextTick()

    const rowMenu = wrapper.findAllComponents(VfsActionMenu).find((menu) => menu.props('mode') === 'entity-actions')
    if (!rowMenu) throw new Error('entity row VfsActionMenu not found')
    const details = rowMenu.get('details.vfs-action-menu')
    const toggle = rowMenu.get('summary.vfs-action-menu__toggle')

    for (let i = 0; i < 20; i += 1) {
      await toggle.trigger('click')
      expect(details.attributes('open')).toBeDefined()
      await settleActionMenuOutsideBinding()
      document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await wrapper.vm.$nextTick()
      expect(details.attributes('open')).toBeUndefined()
    }
  })

  it('row menu stays openable after two outside-dismiss cycles (third open)', async () => {
    const wrapper = mountTracked(VfsMainScreen)
    const rowMenu = wrapper.findAllComponents(VfsActionMenu).find((menu) => menu.props('mode') === 'entity-actions')
    if (!rowMenu) throw new Error('entity row VfsActionMenu not found')
    const details = rowMenu.get('details.vfs-action-menu')
    const toggle = rowMenu.get('summary.vfs-action-menu__toggle')

    for (let cycle = 0; cycle < 2; cycle += 1) {
      await toggle.trigger('click')
      expect(details.attributes('open')).toBeDefined()
      await settleActionMenuOutsideBinding()
      document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await wrapper.vm.$nextTick()
      expect(details.attributes('open')).toBeUndefined()
    }

    await toggle.trigger('click')
    await settleActionMenuOutsideBinding()
    expect(details.attributes('open')).toBeDefined()
  })

  it('dismisses header menu on outside click', async () => {
    const wrapper = mountTracked(VfsMainScreen)
    const menu = getHeaderActionMenu(wrapper)
    const details = menu.get('details.vfs-action-menu')
    await menu.get('summary.vfs-action-menu__toggle').trigger('click')
    expect(details.attributes('open')).toBeDefined()
    await settleActionMenuOutsideBinding()

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(details.attributes('open')).toBeUndefined()
  })

  it('enforces mutual exclusion between header and row menus', async () => {
    const wrapper = mountTracked(VfsMainScreen)
    const headerMenu = getHeaderActionMenu(wrapper)
    const headerDetails = headerMenu.get('details.vfs-action-menu')
    const rowMenu = wrapper.findAllComponents(VfsActionMenu).find((menu) => menu.props('mode') === 'entity-actions')
    if (!rowMenu) throw new Error('entity row VfsActionMenu not found')
    const rowDetails = rowMenu.get('details.vfs-action-menu')

    await rowMenu.get('summary.vfs-action-menu__toggle').trigger('click')
    expect(rowDetails.attributes('open')).toBeDefined()

    await headerMenu.get('summary.vfs-action-menu__toggle').trigger('click')
    expect(headerDetails.attributes('open')).toBeDefined()
    expect(rowDetails.attributes('open')).toBeUndefined()

    await rowMenu.get('summary.vfs-action-menu__toggle').trigger('click')
    expect(rowDetails.attributes('open')).toBeDefined()
    expect(headerDetails.attributes('open')).toBeUndefined()
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

})
