import { describe, expect, it } from 'vitest'
import { createVfsPersistenceStore } from '@/app/stores/vfs-persistence-store'
import { ChatVfsSnapshotService } from '@/app/services/vfs-snapshot/chat-vfs-snapshot-service'
import { DeflateContentCodec } from '@/infra/serialization/deflate-codec'
import { createEmptyVfsSnapshot } from '@/infra/persistence/vfs-snapshot.schema'
import { parseVfsChatMetadata } from '@/infra/persistence/vfs-chat-metadata.schema'
import type { StContextAdapter } from '@/infra/persistence/st-context-adapter'
import { VfsCore } from '@/domain/vfs/vfs-core'
import { buildManifestEntriesFromBefore } from '@/domain/vfs-snapshot/vfs-snapshot-manifest'
import type { ChatVfsSnapshotRecord } from '@/domain/vfs-snapshot/vfs-snapshot-types'

function createAdapterMock(): StContextAdapter {
  let ext: Record<string, unknown> = {}
  let chat: Record<string, unknown> = {}
  return {
    readExtensionRaw: () => ext,
    writeExtensionRaw: (raw) => {
      ext = raw
    },
    saveExtension: () => {},
    readChatRaw: () => chat,
    writeChatRaw: (raw) => {
      chat = raw
    },
    saveChat: () => {},
  }
}

describe('ChatVfsSnapshotService', () => {
  it('FIFO-trims oldest manifests when over snapshotMaxCount', () => {
    const adapter = createAdapterMock()
    const store = createVfsPersistenceStore(adapter)
    store.init()
    store.updateExtension((draft) => ({ ...draft, snapshotMaxCount: 3 }))
    const svc = new ChatVfsSnapshotService(store, new DeflateContentCodec())
    const base = store.getState().chat.chatVfsSnapshot
    const mk = (suffix: string): ChatVfsSnapshotRecord => ({
      id: `snap-${suffix}`,
      time: `2026-05-12T00:00:00.00${suffix}Z`,
      kind: 'manual',
      entries: buildManifestEntriesFromBefore(base, ['/nope.txt']),
    })
    let snaps: ChatVfsSnapshotRecord[] = []
    for (let i = 0; i < 4; i += 1) {
      snaps = svc.mergeIntoChatSnapshots(snaps, mk(String(i)))
    }
    expect(snaps.map((s) => s.id)).toEqual(['snap-1', 'snap-2', 'snap-3'])
  })

  it('applySnapshotById fails without mutating chat when snapshot is missing', () => {
    const store = createVfsPersistenceStore(createAdapterMock())
    store.init()
    const before = JSON.stringify(store.getState().chat.chatVfsSnapshot)
    const svc = new ChatVfsSnapshotService(store, new DeflateContentCodec())
    const result = svc.applySnapshotById('missing-id')
    expect(result.ok).toBe(false)
    expect(JSON.stringify(store.getState().chat.chatVfsSnapshot)).toBe(before)
  })

  it('rolls back a renamed path using a pre-batch manifest', () => {
    const store = createVfsPersistenceStore(createAdapterMock())
    store.init()
    const codec = new DeflateContentCodec()
    const core = new VfsCore(codec)
    core.importSnapshot(createEmptyVfsSnapshot())
    core.writeFile('/old.txt', 'hello', { createParents: true })
    const before = core.exportSnapshot()
    core.rename('/old.txt', 'new.txt')
    const after = core.exportSnapshot()

    const svc = new ChatVfsSnapshotService(store, codec)
    const record = svc.buildToolBatchPreRecord(before, after)
    expect(record).not.toBeNull()
    expect(record?.entries.map((e) => e.path).sort()).toEqual(['/new.txt', '/old.txt'].sort())

    store.updateChat((draft) => ({
      ...draft,
      chatVfsSnapshot: after,
      chatVfsSnapshots: record ? svc.mergeIntoChatSnapshots(draft.chatVfsSnapshots, record) : draft.chatVfsSnapshots,
    }))
    const applied = svc.applySnapshotById(record!.id)
    expect(applied.ok).toBe(true)
    const finalCore = new VfsCore(codec)
    finalCore.importSnapshot(store.getState().chat.chatVfsSnapshot)
    expect(finalCore.exists('/old.txt')).toBe(true)
    expect(finalCore.exists('/new.txt')).toBe(false)
    expect(finalCore.readFile('/old.txt')).toBe('hello')
  })
})

describe('parseVfsChatMetadata legacy keys', () => {
  it('ignores chatVfsVersions and defaults chatVfsSnapshots', () => {
    const parsed = parseVfsChatMetadata({
      chatVfsVersions: [{ id: 'x', time: '2026-01-01T00:00:00.000Z', operator: 'a', actionType: 'save', scope: '*' }],
    })
    expect(parsed.chatVfsSnapshots).toEqual([])
  })
})
