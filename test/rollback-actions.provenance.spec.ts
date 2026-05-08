import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useVfsBatchRollbackAction } from '@/app/composables/components-composables/useVfsRollbackActions'

const updateChatMock = vi.fn()
const getStateMock = vi.fn(() => ({
  chat: {
    chatVfsSnapshot: {
      schemaVersion: 1,
      rootId: 'root',
      nodes: {
        root: { id: 'root', type: 'directory', path: '/', name: '', parentId: null, children: [], mtime: 1 },
      },
    },
    chatVfsVersions: [],
  },
}))

vi.mock('@/app/stores/vfs-store-singleton', () => ({
  vfsPersistenceStore: {
    updateChat: (updater: (draft: { chatVfsVersions: unknown[] }) => { chatVfsVersions: unknown[] }) => updateChatMock(updater),
    getState: () => getStateMock(),
  },
}))

const rollbackBatchMock = vi.fn(async () => ({ ok: true as const }))
vi.mock('@/app/services/vfs/rollbackService', () => ({
  rollbackCommit: vi.fn(async () => ({ ok: true as const })),
  rollbackBatch: (...args: unknown[]) => rollbackBatchMock(...args),
}))

describe('useVfsRollbackActions provenance', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-08T12:00:00.000Z'))
    updateChatMock.mockReset()
    rollbackBatchMock.mockClear()
  })

  it('records batch rollback provenance using the applied (last) target commit id', async () => {
    const ok = await useVfsBatchRollbackAction(['commit-a', 'commit-b'])
    expect(ok).toBe(true)
    expect(rollbackBatchMock).toHaveBeenCalledWith({ commitIds: ['commit-a', 'commit-b'] })
    expect(updateChatMock).toHaveBeenCalledTimes(1)

    const updater = updateChatMock.mock.calls[0]?.[0] as (draft: { chatVfsVersions: unknown[] }) => {
      chatVfsVersions: Array<Record<string, unknown>>
    }
    const next = updater({ chatVfsVersions: [] })
    expect(next.chatVfsVersions).toHaveLength(1)
    expect(next.chatVfsVersions[0]).toMatchObject({
      actionType: 'batch-rollback',
      sourceVersion: { id: 'commit-b', reason: 'batch-rollback-target' },
    })
    expect(next.chatVfsVersions[0]?.sourceVersions).toEqual([
      { id: 'commit-a', reason: 'batch-rollback-target' },
      { id: 'commit-b', reason: 'batch-rollback-target' },
    ])
  })
})

