import { describe, expect, it } from 'vitest'
import type { VfsPersistenceStore } from '@/app/stores/vfs-persistence-store'
import { ChatVfsSnapshotService } from './chat-vfs-snapshot-service'
import { DeflateContentCodec } from '@/infra/serialization/deflate-codec'
import { createEmptyVfsSnapshot } from '@/infra/persistence/vfs-snapshot.schema'
import { parseVfsChatMetadata } from '@/infra/persistence/vfs-chat-metadata.schema'
import { parseVfsExtensionSettings } from '@/infra/persistence/vfs-extension-settings.schema'
import type { ChatVfsSnapshotRecord } from '@/domain/vfs-snapshot/vfs-snapshot-types'

function createMemoryStore(initial: { snapshots: ChatVfsSnapshotRecord[] }): {
  store: VfsPersistenceStore
  getChatSnapshot: () => ReturnType<VfsPersistenceStore['getState']>['chat']['chatVfsSnapshot']
} {
  let chat = parseVfsChatMetadata({
    chatVfsSnapshot: createEmptyVfsSnapshot(),
    chatVfsSnapshots: initial.snapshots,
  })
  const extension = parseVfsExtensionSettings({})

  const store: VfsPersistenceStore = {
    init: () => {},
    reloadChatState: () => {},
    setExtensionEnabled: () => {},
    updateExtension: () => {},
    setChatMounted: () => {},
    updateChat: (updater) => {
      chat = updater({
        ...chat,
        chatVfsLogs: [...chat.chatVfsLogs],
        chatVfsSnapshots: [...chat.chatVfsSnapshots],
      })
    },
    subscribe: () => () => {},
    getState: () => ({
      extension: { ...extension },
      chat: {
        ...chat,
        chatVfsLogs: [...chat.chatVfsLogs],
        chatVfsSnapshots: [...chat.chatVfsSnapshots],
      },
    }),
  }

  return {
    store,
    getChatSnapshot: () => store.getState().chat.chatVfsSnapshot,
  }
}

describe('ChatVfsSnapshotService.applySnapshotById', () => {
  const codec = new DeflateContentCodec()

  it('returns SNAPSHOT_NOT_FOUND when id is missing', () => {
    const { store } = createMemoryStore({ snapshots: [] })
    const svc = new ChatVfsSnapshotService(store, codec)
    const result = svc.applySnapshotById('missing-id')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errorCode).toBe('SNAPSHOT_NOT_FOUND')
    }
  })

  it('applies an absent-only manifest successfully', () => {
    const record: ChatVfsSnapshotRecord = {
      id: 'snap-test',
      time: new Date().toISOString(),
      kind: 'tool-batch-pre',
      entries: [{ path: '/never-created.txt', presence: 'absent' }],
    }
    const { store, getChatSnapshot } = createMemoryStore({ snapshots: [record] })
    const before = getChatSnapshot()
    const svc = new ChatVfsSnapshotService(store, codec)
    const result = svc.applySnapshotById('snap-test')
    expect(result.ok).toBe(true)
    const after = getChatSnapshot()
    expect(after).toBeDefined()
    expect(after).not.toBe(before)
  })
})
