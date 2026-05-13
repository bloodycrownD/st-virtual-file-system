import { describe, expect, it } from 'vitest'
import type { VfsPersistenceStore } from '@/app/stores/vfs-persistence-store'
import { ChatVfsCheckpointService } from './chat-vfs-checkpoint-service'
import { DeflateContentCodec } from '@/infra/serialization/deflate-codec'
import { createEmptyVfsSnapshot, serializeVfsSnapshot } from '@/infra/persistence/vfs-snapshot.schema'
import { parseVfsChatMetadata } from '@/infra/persistence/vfs-chat-metadata.schema'
import { parseVfsExtensionSettings } from '@/infra/persistence/vfs-extension-settings.schema'
import { VfsCore } from '@/domain/vfs/vfs-core'

function createMemoryStore(initial: { chat: ReturnType<typeof parseVfsChatMetadata> }): {
  store: VfsPersistenceStore
  getChatSnapshot: () => ReturnType<VfsPersistenceStore['getState']>['chat']['chatVfsSnapshot']
} {
  let chat = initial.chat
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
        vfsPathVersionStore: { ...chat.vfsPathVersionStore },
        vfsCheckpoints: [...chat.vfsCheckpoints],
      })
    },
    subscribe: () => () => {},
    getState: () => ({
      extension: { ...extension },
      chat: {
        ...chat,
        chatVfsLogs: [...chat.chatVfsLogs],
        vfsPathVersionStore: { ...chat.vfsPathVersionStore },
        vfsCheckpoints: [...chat.vfsCheckpoints],
      },
    }),
  }

  return {
    store,
    getChatSnapshot: () => store.getState().chat.chatVfsSnapshot,
  }
}

describe('ChatVfsCheckpointService.applyCheckpointById', () => {
  const codec = new DeflateContentCodec()

  it('returns CHECKPOINT_NOT_FOUND when id is missing', () => {
    const chat = parseVfsChatMetadata({})
    const { store } = createMemoryStore({ chat })
    const svc = new ChatVfsCheckpointService(store, codec)
    const result = svc.applyCheckpointById('missing-id')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errorCode).toBe('CHECKPOINT_NOT_FOUND')
    }
  })

  it('materializes sparse checkpoint tree (later paths disappear when rolling back)', () => {
    const codecLocal = new DeflateContentCodec()
    const core = new VfsCore(codecLocal)
    core.importSnapshot(createEmptyVfsSnapshot())
    core.writeFile('/a.txt', 'only-a', { createParents: true, updatedBy: 'user' })
    const cp1Tree = core.exportSnapshot()

    core.writeFile('/b.txt', 'b', { createParents: true, updatedBy: 'user' })
    const cp2Tree = core.exportSnapshot()

    const chat = parseVfsChatMetadata({})
    const { store, getChatSnapshot } = createMemoryStore({ chat })
    const svc = new ChatVfsCheckpointService(store, codecLocal)

    store.updateChat((draft) => {
      const m1 = svc.mergePostCommitCheckpoint(draft, cp1Tree, 'tool-batch')
      return { ...draft, chatVfsSnapshot: cp1Tree, vfsPathVersionStore: m1.vfsPathVersionStore, vfsCheckpoints: m1.vfsCheckpoints }
    })
    store.updateChat((draft) => {
      const m2 = svc.mergePostCommitCheckpoint(draft, cp2Tree, 'tool-batch')
      return { ...draft, chatVfsSnapshot: cp2Tree, vfsPathVersionStore: m2.vfsPathVersionStore, vfsCheckpoints: m2.vfsCheckpoints }
    })

    const cp1Id = store.getState().chat.vfsCheckpoints[0]?.id
    expect(cp1Id).toBeTruthy()
    const applied = svc.applyCheckpointById(cp1Id!)
    expect(applied.ok).toBe(true)

    const live = new VfsCore(codecLocal)
    live.importSnapshot(serializeVfsSnapshot(getChatSnapshot()))
    expect(live.exists('/a.txt')).toBe(true)
    expect(live.exists('/b.txt')).toBe(false)
    expect(live.readFile('/a.txt')).toBe('only-a')
  })

  it('FIFO-trims oldest checkpoints when over snapshotMaxCount', () => {
    const codecLocal = new DeflateContentCodec()
    const chat = parseVfsChatMetadata({})
    const extension = parseVfsExtensionSettings({ snapshotMaxCount: 3 })
    let chatState = chat
    const store: VfsPersistenceStore = {
      init: () => {},
      reloadChatState: () => {},
      setExtensionEnabled: () => {},
      updateExtension: () => {},
      setChatMounted: () => {},
      updateChat: (updater) => {
        chatState = updater({
          ...chatState,
          chatVfsLogs: [...chatState.chatVfsLogs],
          vfsPathVersionStore: { ...chatState.vfsPathVersionStore },
          vfsCheckpoints: [...chatState.vfsCheckpoints],
        })
      },
      subscribe: () => () => {},
      getState: () => ({
        extension: { ...extension },
        chat: {
          ...chatState,
          chatVfsLogs: [...chatState.chatVfsLogs],
          vfsPathVersionStore: { ...chatState.vfsPathVersionStore },
          vfsCheckpoints: [...chatState.vfsCheckpoints],
        },
      }),
    }

    const svc = new ChatVfsCheckpointService(store, codecLocal)
    const base = store.getState().chat.chatVfsSnapshot
    for (let i = 0; i < 4; i += 1) {
      const core = new VfsCore(codecLocal)
      core.importSnapshot(base)
      core.writeFile(`/nope-${i}.txt`, 'x', { createParents: true, updatedBy: 'user' })
      const after = core.exportSnapshot()
      store.updateChat((draft) => {
        const merged = svc.mergePostCommitCheckpoint(draft, after, 'tool-batch')
        return { ...draft, chatVfsSnapshot: after, vfsPathVersionStore: merged.vfsPathVersionStore, vfsCheckpoints: merged.vfsCheckpoints }
      })
    }

    expect(store.getState().chat.vfsCheckpoints.map((c) => c.id).length).toBe(3)

    const referenced = new Set<string>()
    for (const cp of store.getState().chat.vfsCheckpoints) {
      for (const vid of Object.values(cp.treeVersion)) referenced.add(vid)
    }
    for (const chain of Object.values(store.getState().chat.vfsPathVersionStore)) {
      for (const entry of chain) {
        expect(referenced.has(entry.versionId)).toBe(true)
      }
    }
  })

  it('applyCheckpointById rejects checkpoints with incomplete parent chains', () => {
    const codecLocal = new DeflateContentCodec()
    const chat = parseVfsChatMetadata({})
    const { store } = createMemoryStore({ chat })
    const svc = new ChatVfsCheckpointService(store, codecLocal)
    store.updateChat((draft) => ({
      ...draft,
      vfsPathVersionStore: {
        '/docs': [
          {
            versionId: 'pv-dir',
            kind: 'directory',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        '/docs/a.txt': [
          {
            versionId: 'pv-file',
            kind: 'file',
            createdAt: '2026-01-01T00:00:00.000Z',
            content: { encoding: 'plain', data: 'x', originalSize: 1 },
            updatedBy: 'user',
          },
        ],
      },
      vfsCheckpoints: [
        {
          id: 'cp-bad',
          time: '2026-01-01T00:00:00.000Z',
          source: 'tool-batch',
          treeVersion: { '/docs/a.txt': 'pv-file' },
        },
      ],
    }))
    const result = svc.applyCheckpointById('cp-bad')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errorCode).toBe('CHECKPOINT_INVALID')
    }
  })

  it('persistEditorSaveWithCheckpoint appends a save log row carrying checkpointId', () => {
    const codecLocal = new DeflateContentCodec()
    const core = new VfsCore(codecLocal)
    core.importSnapshot(createEmptyVfsSnapshot())
    core.writeFile('/x.txt', 'a', { createParents: true, updatedBy: 'user' })
    const seeded = core.exportSnapshot()

    const chat = parseVfsChatMetadata({})
    const { store } = createMemoryStore({ chat })
    store.updateChat((draft) => ({ ...draft, chatVfsSnapshot: seeded }))

    const svc = new ChatVfsCheckpointService(store, codecLocal)
    const checkpointId = svc.persistEditorSaveWithCheckpoint('/x.txt', 'b')

    const logs = store.getState().chat.chatVfsLogs
    const row = logs.find((e) => e.toolName === 'save' && e.status === 'success')
    expect(row?.checkpointId).toBe(checkpointId)
    expect(row?.argsSummary).toContain('/x.txt')
  })
})

describe('parseVfsChatMetadata destructive upgrade', () => {
  it('strips legacy manifests + snapshotId and resets checkpoint store', () => {
    const parsed = parseVfsChatMetadata({
      chatVfsLogs: [
        {
          id: 'l1',
          timestamp: 1,
          chatId: 'c',
          messageId: 'm',
          batchId: 'b',
          toolName: 'batch',
          status: 'success',
          durationMs: 1,
          argsSummary: 'calls=1',
          snapshotId: 'snap-legacy',
        },
      ],
      chatVfsSnapshots: [
        {
          id: 'snap-legacy',
          time: '2026-01-01T00:00:00.000Z',
          kind: 'manual',
          entries: [{ path: '/x.txt', presence: 'absent' as const }],
        },
      ],
    })
    expect(parsed.vfsCheckpoints).toEqual([])
    expect(parsed.vfsPathVersionStore).toEqual({})
    expect('snapshotId' in parsed.chatVfsLogs[0]!).toBe(false)
    expect(parsed.vfsChatPersistenceVersion).toBe(2)
  })
})
