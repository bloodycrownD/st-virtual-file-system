import { mount } from '@vue/test-utils'
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { nextTick } from 'vue'

const mockFetchLogs = vi.fn()

const { rollbackMock } = vi.hoisted(() => ({
  rollbackMock: vi.fn(async () => true),
}))

vi.mock('@/app/services/vfs/logService', () => ({
  fetchLogs: (...args: unknown[]) => mockFetchLogs(...args),
}))

vi.mock('@/app/composables/components-composables/useVfsSnapshotRollback', () => ({
  useVfsSnapshotRollback: (id: string) => rollbackMock(id),
}))

const historyState = vi.hoisted(() => ({
  chat: {
    chatVfsLogs: [
      {
        id: '1',
        timestamp: 1,
        chatId: 'c',
        messageId: 'm',
        batchId: 'b',
        toolName: 'batch',
        status: 'success',
        durationMs: 1,
        argsSummary: 'calls=1',
        snapshotId: 'snap-1',
      },
    ],
    chatVfsSnapshots: [
      {
        id: 'snap-1',
        time: '2026-01-01T00:00:00.000Z',
        kind: 'tool-batch-pre' as const,
        entries: [{ path: '/a.txt', presence: 'absent' as const }],
      },
    ],
  },
}))

vi.mock('@/app/stores/vfs-store-singleton', () => ({
  vfsPersistenceStore: {
    getState: () => historyState,
    subscribe: (listener: () => void) => {
      listener()
      return () => {}
    },
  },
}))

describe('VFS history screen + VfsLogPanel component baseline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(globalThis as { toastr: { error: (message: string) => void } }).toastr = { error: vi.fn() }
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

  it('exposes new structural classes for history and log screens', async () => {
    const { default: VfsHistoryScreen } = await import('@/app/screens/business-screens/VfsHistoryScreen.vue')
    const historyWrapper = mount(VfsHistoryScreen)
    await nextTick()
    expect(historyWrapper.find('.vfs-history-status-bar').exists()).toBe(true)
    expect(historyWrapper.find('.vfs-history-status-pill').exists()).toBe(true)
    expect(historyWrapper.find('[data-testid="vfs-log-rollback"]').exists()).toBe(true)

    mockFetchLogs.mockResolvedValue({ items: [], total: 0 })
    const { default: VfsLogPanel } = await import('@/app/components/business-components/VfsLogPanel.vue')
    const logWrapper = mount(VfsLogPanel, { props: { refreshToken: 0 } })
    expect(logWrapper.find('.vfs-log-panel-status').exists()).toBe(true)
    expect(logWrapper.find('.vfs-log-panel-pager').exists()).toBe(true)
  })

  it('renders distinct log content states for refreshing, failed, and no-data', async () => {
    let resolveFetch: ((value: { items: never[]; total: number }) => void) | undefined
    mockFetchLogs.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve
        }),
    )

    const { default: VfsLogPanel } = await import('@/app/components/business-components/VfsLogPanel.vue')
    const wrapper = mount(VfsLogPanel, { props: { refreshToken: 0 } })

    await wrapper.setProps({ refreshToken: 1 })
    await nextTick()
    await Promise.resolve()
    expect(wrapper.find('.vfs-log-content-refreshing').exists()).toBe(true)

    resolveFetch?.({ items: [], total: 0 })
    await Promise.resolve()
    await nextTick()
    expect(wrapper.find('.vfs-log-content-no-data').exists()).toBe(true)

    mockFetchLogs.mockRejectedValueOnce(new Error('fetch failed'))
    await wrapper.find('.vfs-log-refresh-button').trigger('click')
    await nextTick()
    await Promise.resolve()
    await nextTick()
    expect(wrapper.find('.vfs-log-content-failed').exists()).toBe(true)
  })
})
