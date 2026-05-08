import { beforeEach, describe, expect, it } from 'vitest'
import { rollbackBatch } from '@/app/services/vfs/rollbackService'
import { vfsPersistenceStore } from '@/app/stores/vfs-store-singleton'
import { serializeVfsSnapshot } from '@/infra/persistence/vfs-snapshot.schema'

function cloneSnapshot<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

describe('rollbackService batch rollback', () => {
  beforeEach(() => {
    const baseSnapshot = cloneSnapshot(vfsPersistenceStore.getState().chat.chatVfsSnapshot)
    const firstSnapshot = cloneSnapshot(baseSnapshot)
    const secondSnapshot = cloneSnapshot(baseSnapshot)
    const firstRoot = firstSnapshot.nodes[firstSnapshot.rootId]
    const secondRoot = secondSnapshot.nodes[secondSnapshot.rootId]
    firstRoot.mtime = 111
    secondRoot.mtime = 222

    vfsPersistenceStore.updateChat((draft) => ({
      ...draft,
      chatVfsSnapshot: serializeVfsSnapshot(baseSnapshot),
      chatVfsVersions: [
        {
          id: 'commit-a',
          time: new Date('2026-05-08T10:00:00.000Z').toISOString(),
          operator: 'assistant',
          actionType: 'save',
          scope: '/docs/a.md',
          snapshot: serializeVfsSnapshot(firstSnapshot),
        },
        {
          id: 'commit-b',
          time: new Date('2026-05-08T11:00:00.000Z').toISOString(),
          operator: 'assistant',
          actionType: 'save',
          scope: '/docs/b.md',
          snapshot: serializeVfsSnapshot(secondSnapshot),
        },
      ],
    }))
  })

  it('applies the snapshot of the last selected commit', async () => {
    const result = await rollbackBatch({ commitIds: ['commit-a', 'commit-b'] })

    expect(result).toEqual({ ok: true })
    const root = vfsPersistenceStore.getState().chat.chatVfsSnapshot.nodes[vfsPersistenceStore.getState().chat.chatVfsSnapshot.rootId]
    expect(root.mtime).toBe(222)
  })

  it('fails when any selected target has no rollback snapshot', async () => {
    const result = await rollbackBatch({ commitIds: ['commit-a', 'missing-commit'] })

    expect(result.ok).toBe(false)
    expect(result.errorCode).toBe('E_COMMIT_APPLY_FAILED')
  })
})
