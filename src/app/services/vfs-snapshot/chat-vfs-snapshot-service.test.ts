import { describe, expect, it } from 'vitest'
import type { VfsPersistenceStore } from '@/app/stores/vfs-persistence-store'
import { ChatVfsSnapshotService } from './chat-vfs-snapshot-service'
import { DeflateContentCodec } from '@/infra/serialization/deflate-codec'
import { createEmptyVfsSnapshot, serializeVfsSnapshot } from '@/infra/persistence/vfs-snapshot.schema'
import { parseVfsChatMetadata } from '@/infra/persistence/vfs-chat-metadata.schema'
import { parseVfsExtensionSettings } from '@/infra/persistence/vfs-extension-settings.schema'
import type { ChatVfsSnapshotRecord } from '@/domain/vfs-snapshot/vfs-snapshot-types'
import type { VfsNodeSnapshot, VfsSnapshot } from '@/domain/vfs/types'
import { VfsCore } from '@/domain/vfs/vfs-core'
import { applyManifestEntriesToCore } from '@/domain/vfs-snapshot/vfs-snapshot-manifest'

/** WHY: two VfsCore exports can differ only by wall-clock mtimes; assert tree shape + content, not timestamps. */
function snapshotForCompare(snapshot: VfsSnapshot): VfsSnapshot {
  const nodes: Record<string, VfsNodeSnapshot> = {}
  for (const [id, node] of Object.entries(snapshot.nodes)) {
    if (node.type === 'file') {
      nodes[id] = { ...node, mtime: 0, ctime: 0 }
    } else {
      nodes[id] = { ...node, mtime: 0 }
    }
  }
  return { ...snapshot, nodes }
}

function createMemoryStore(initial: {
  snapshots: ChatVfsSnapshotRecord[]
  chatVfsSnapshot?: VfsSnapshot
}): {
  store: VfsPersistenceStore
  getChatSnapshot: () => ReturnType<VfsPersistenceStore['getState']>['chat']['chatVfsSnapshot']
} {
  let chat = parseVfsChatMetadata({
    chatVfsSnapshot: initial.chatVfsSnapshot ?? createEmptyVfsSnapshot(),
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

  it('applies manifest so persisted chat snapshot matches manifest application', () => {
    const setup = new VfsCore(codec)
    setup.importSnapshot(createEmptyVfsSnapshot())
    setup.writeFile('/rollback-target.txt', 'before-batch', { createParents: true, updatedBy: 'user' })
    const beforeTree = setup.exportSnapshot()

    const record: ChatVfsSnapshotRecord = {
      id: 'snap-test',
      time: new Date().toISOString(),
      kind: 'tool-batch-pre',
      entries: [{ path: '/rollback-target.txt', presence: 'absent' }],
    }
    const { store, getChatSnapshot } = createMemoryStore({
      snapshots: [record],
      chatVfsSnapshot: beforeTree,
    })
    const expected = new VfsCore(codec)
    expected.importSnapshot(serializeVfsSnapshot(beforeTree))
    applyManifestEntriesToCore(expected, record.entries)

    const svc = new ChatVfsSnapshotService(store, codec)
    const result = svc.applySnapshotById('snap-test')
    expect(result.ok).toBe(true)
    expect(snapshotForCompare(serializeVfsSnapshot(getChatSnapshot()))).toEqual(
      snapshotForCompare(serializeVfsSnapshot(expected.exportSnapshot())),
    )
  })
})
