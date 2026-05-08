import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VFS_ERROR_CODES } from '@/app/constants/vfsErrorCodes'
import { saveCommit } from '@/app/services/vfs/commitService'

const updateChatMock = vi.fn()
const getStateMock = vi.fn(() => ({ chat: { chatVfsVersions: [] as unknown[] } }))

vi.mock('@/app/stores/vfs-store-singleton', () => ({
  vfsPersistenceStore: {
    updateChat: (updater: (draft: { chatVfsVersions: unknown[] }) => { chatVfsVersions: unknown[] }) =>
      updateChatMock(updater),
    getState: () => getStateMock(),
  },
}))

describe('commit service', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-08T12:00:00.000Z'))
    updateChatMock.mockReset()
    getStateMock.mockClear()
  })

  it('rejects blank summary and keeps failure contract', async () => {
    const result = await saveCommit({ summary: '   ' })
    expect(result).toEqual({
      ok: false,
      errorCode: VFS_ERROR_CODES.SAVE_FAILED,
      message: 'Commit summary is required',
    })
    expect(updateChatMock).not.toHaveBeenCalled()
  })

  it('appends tab2-visible save record with required schema fields', async () => {
    const result = await saveCommit({ summary: '/docs/docs.md' })
    expect(result.ok).toBe(true)
    expect(updateChatMock).toHaveBeenCalledTimes(1)

    const updater = updateChatMock.mock.calls[0]?.[0] as (draft: { chatVfsVersions: unknown[] }) => {
      chatVfsVersions: Record<string, unknown>[]
    }
    const next = updater({ chatVfsVersions: [] })
    expect(next.chatVfsVersions).toHaveLength(1)
    expect(next.chatVfsVersions[0]).toMatchObject({
      time: '2026-05-08T12:00:00.000Z',
      operator: 'assistant',
      actionType: 'save',
      scope: '/docs/docs.md',
      source: 'manual',
      summary: '/docs/docs.md',
    })
  })
})
