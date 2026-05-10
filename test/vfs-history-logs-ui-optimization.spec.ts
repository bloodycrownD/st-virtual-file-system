import { mount } from '@vue/test-utils'
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { nextTick } from 'vue'

const mockFetchLogs = vi.fn()
const mockBatchRollback = vi.fn()

vi.mock('@/app/services/vfs/logService', () => ({
  fetchLogs: (...args: unknown[]) => mockFetchLogs(...args),
}))

vi.mock('@/app/composables/components-composables/useVfsRollbackActions', () => ({
  useVfsBatchRollbackAction: (...args: unknown[]) => mockBatchRollback(...args),
}))

describe('VFS history/logs UI optimization baseline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps refresh token driven log refresh semantics', async () => {
    mockFetchLogs.mockResolvedValue({ items: [], total: 0 })
    const { default: VfsLogPanel } = await import('@/app/components/business-components/VfsLogPanel.vue')

    const wrapper = mount(VfsLogPanel, { props: { refreshToken: 0 } })
    await nextTick()
    expect(mockFetchLogs).toHaveBeenCalledTimes(0)

    await wrapper.setProps({ refreshToken: 1 })
    await nextTick()
    await Promise.resolve()
    expect(mockFetchLogs).toHaveBeenCalledTimes(1)
    expect(mockFetchLogs).toHaveBeenCalledWith({ page: 1, pageSize: 20 })
  })

  it('keeps batch rollback selection semantics', async () => {
    mockBatchRollback.mockResolvedValue(true)
    const commits = [
      { id: 'v1', time: '2026-05-10T12:00:00.000Z', actionType: 'write', scope: 'file' },
      { id: 'v2', time: '2026-05-10T12:01:00.000Z', actionType: 'write', scope: 'file' },
    ]

    const { default: VfsCommitTab } = await import('@/app/components/business-components/VfsCommitTab.vue')
    const wrapper = mount(VfsCommitTab, { props: { commits } })

    const actionButton = wrapper.get('button')
    expect((actionButton.element as HTMLButtonElement).disabled).toBe(true)

    await wrapper.findAll('input[type="checkbox"]')[0].trigger('change')
    await nextTick()
    expect((actionButton.element as HTMLButtonElement).disabled).toBe(false)

    await actionButton.trigger('click')
    expect(mockBatchRollback).toHaveBeenCalledTimes(1)
    expect(mockBatchRollback).toHaveBeenCalledWith(['v2'])
  })

  it('exposes new structural classes for history and log screens', async () => {
    const { default: VfsHistoryScreen } = await import('@/app/screens/business-screens/VfsHistoryScreen.vue')
    const historyWrapper = mount(VfsHistoryScreen, {
      global: {
        stubs: {
          VfsCommitTab: { template: '<div class="stub-commit-tab" />' },
          VfsHistoryPanel: { template: '<div class="stub-history-panel" />' },
        },
      },
    })
    expect(historyWrapper.find('.vfs-history-status-bar').exists()).toBe(true)
    expect(historyWrapper.find('.vfs-history-status-pill').exists()).toBe(true)

    mockFetchLogs.mockResolvedValue({ items: [], total: 0 })
    const { default: VfsLogPanel } = await import('@/app/components/business-components/VfsLogPanel.vue')
    const logWrapper = mount(VfsLogPanel, { props: { refreshToken: 0 } })
    expect(logWrapper.find('.vfs-log-panel-status').exists()).toBe(true)
    expect(logWrapper.find('.vfs-log-panel-pager').exists()).toBe(true)
  })
})
