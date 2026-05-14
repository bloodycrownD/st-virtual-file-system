import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import VfsMainScreen from '@/app/screens/business-screens/VfsMainScreen.vue'
import { vfsPersistenceStore } from '@/app/stores/vfs-store-singleton'

const dispatchSpy = vi.fn()
const useVfsCheckpointRollbackMock = vi.fn(async (_checkpointId: string) => true)

vi.mock('@/app/composables/screens-composables/useVfsHistoryStateMachine', () => ({
  createVfsHistoryStateMachine: () => ({
    state: { status: 'idle' },
    dispatch: dispatchSpy,
  }),
}))

vi.mock('@/app/composables/components-composables/useVfsCheckpointRollback', () => ({
  useVfsCheckpointRollback: (checkpointId: string) => useVfsCheckpointRollbackMock(checkpointId),
}))

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

async function flushActionMenuDom(): Promise<void> {
  await flushPromises()
  await nextTick()
}

async function selectDocsFile(wrapper: ReturnType<typeof mount>) {
  const list = wrapper.get('[data-testid="vfs-file-manager-list"]')
  const candidates = list.findAll('button.vfs-fm-item')
  const docsDir = candidates.find((btn) => btn.text().includes('docs'))
  if (!docsDir) throw new Error('docs directory not found')
  await docsDir.trigger('click')
  await wrapper.vm.$nextTick()
}

async function triggerEntityAction(wrapper: ReturnType<typeof mount>, action: string, rowTextIncludes: string) {
  const list = wrapper.get('[data-testid="vfs-file-manager-list"]')
  const rows = list.findAll('li.vfs-fm-row')
  const targetRow = rows.find((row) => row.text().includes(rowTextIncludes))
  if (!targetRow) throw new Error(`file manager row containing "${rowTextIncludes}" not found`)
  await targetRow.get('summary.vfs-action-menu__toggle').trigger('click')
  await flushActionMenuDom()
  const panel = document.querySelector('[data-testid="vfs-entity-action-menu-panel"]')
  if (!panel) throw new Error('entity action menu panel not found')
  const actionButton = panel.querySelector(`[data-action="${action}"]`)
  if (!actionButton) throw new Error(`entity action "${action}" not found`)
  actionButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await flushActionMenuDom()
}

describe('vfs preview fullscreen', () => {
  const fullscreenElementHolder: { current: Element | null } = { current: null }
  let origRequestFullscreen: typeof HTMLElement.prototype.requestFullscreen | undefined
  let origExitFullscreen: typeof Document.prototype.exitFullscreen | undefined

  beforeEach(async () => {
    window.innerWidth = 1366
    dispatchSpy.mockReset()
    useVfsCheckpointRollbackMock.mockReset()
    useVfsCheckpointRollbackMock.mockResolvedValue(true)
    ;(globalThis as { toastr: { error: (message: string) => void } }).toastr = {
      error: vi.fn(),
      success: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
    }

    fullscreenElementHolder.current = null
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => fullscreenElementHolder.current,
    })

    origRequestFullscreen = HTMLElement.prototype.requestFullscreen
    origExitFullscreen = Document.prototype.exitFullscreen

    HTMLElement.prototype.requestFullscreen = vi.fn(function requestFullscreenMock(this: HTMLElement) {
      fullscreenElementHolder.current = this
      return Promise.resolve()
    }) as typeof HTMLElement.prototype.requestFullscreen

    Document.prototype.exitFullscreen = vi.fn(() => {
      fullscreenElementHolder.current = null
      return Promise.resolve()
    }) as typeof Document.prototype.exitFullscreen

    const now = Date.now()
    const older = now - 10_000
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
            mtime: older,
            ctime: older,
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
  })

  afterEach(() => {
    fullscreenElementHolder.current = null
    if (origRequestFullscreen) HTMLElement.prototype.requestFullscreen = origRequestFullscreen
    else Reflect.deleteProperty(HTMLElement.prototype, 'requestFullscreen')
    if (origExitFullscreen) Document.prototype.exitFullscreen = origExitFullscreen
    else Reflect.deleteProperty(Document.prototype, 'exitFullscreen')
  })

  async function openDocsMdPreview(wrapper: ReturnType<typeof mount>) {
    await selectDocsFile(wrapper)
    await triggerEntityAction(wrapper, 'open', 'docs.md')
    await nextTick()
  }

  it('exposes fullscreen toggle and calls requestFullscreen on the preview body element', async () => {
    const wrapper = mountTracked(VfsMainScreen)
    await openDocsMdPreview(wrapper)

    expect(wrapper.find('[data-testid="vfs-preview-fullscreen-toggle"]').exists()).toBe(true)
    const previewBody = wrapper.get('[data-testid="vfs-preview-body"]').element as HTMLElement
    const requestSpy = vi.spyOn(previewBody, 'requestFullscreen').mockResolvedValue(undefined as void)

    await wrapper.get('[data-testid="vfs-preview-fullscreen-toggle"]').trigger('click')
    await flushPromises()

    expect(requestSpy).toHaveBeenCalled()
    requestSpy.mockRestore()
  })

  it('when preview subtree is fullscreen, back exits fullscreen and does not navigate to list', async () => {
    const wrapper = mountTracked(VfsMainScreen)
    await openDocsMdPreview(wrapper)

    const previewBody = wrapper.get('[data-testid="vfs-preview-body"]').element as HTMLElement
    vi.spyOn(previewBody, 'requestFullscreen').mockImplementation(function mockFs(this: HTMLElement) {
      fullscreenElementHolder.current = this
      return Promise.resolve()
    })

    await wrapper.get('[data-testid="vfs-preview-fullscreen-toggle"]').trigger('click')
    await flushPromises()
    document.dispatchEvent(new Event('fullscreenchange'))
    await nextTick()

    expect(fullscreenElementHolder.current).toBe(previewBody)

    const exitSpy = vi.spyOn(document, 'exitFullscreen').mockImplementation(() => {
      fullscreenElementHolder.current = null
      return Promise.resolve()
    })

    await wrapper.get('[data-testid="vfs-preview-back"]').trigger('click')
    await flushPromises()
    document.dispatchEvent(new Event('fullscreenchange'))
    await nextTick()

    expect(exitSpy).toHaveBeenCalled()
    expect(wrapper.find('[data-testid="vfs-preview-stack"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="vfs-list-only-layout"]').exists()).toBe(false)

    exitSpy.mockRestore()
  })

  it('when not fullscreen, back still returns to list layout', async () => {
    const wrapper = mountTracked(VfsMainScreen)
    await openDocsMdPreview(wrapper)

    await wrapper.get('[data-testid="vfs-preview-back"]').trigger('click')
    await nextTick()

    expect(wrapper.find('[data-testid="vfs-list-only-layout"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="vfs-preview-stack"]').exists()).toBe(false)
  })

  it('disables fullscreen toggle when requestFullscreen is unavailable', async () => {
    HTMLElement.prototype.requestFullscreen = undefined as unknown as typeof HTMLElement.prototype.requestFullscreen
    const wrapper = mountTracked(VfsMainScreen)
    await openDocsMdPreview(wrapper)

    const toggle = wrapper.get('[data-testid="vfs-preview-fullscreen-toggle"]')
    expect(toggle.attributes('disabled')).toBeDefined()
  })
})
