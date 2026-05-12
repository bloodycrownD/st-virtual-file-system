import { describe, expect, it } from 'vitest'
import { parseVfsExtensionSettings, serializeVfsExtensionSettings } from '@/infra/persistence/vfs-extension-settings.schema'
import { parseVfsChatMetadata, serializeVfsChatMetadata } from '@/infra/persistence/vfs-chat-metadata.schema'
import { createEmptyVfsSnapshot } from '@/infra/persistence/vfs-snapshot.schema'

describe('vfs extension settings schema', () => {
  it('falls back to defaults for invalid values', () => {
    const parsed = parseVfsExtensionSettings({ enabled: 'nope' })
    expect(parsed.enabled).toBe(true)
    expect(parsed.snapshotMaxCount).toBe(10)
    expect(parsed.logMaxBytes).toBe(1024 * 1024)
    expect(parsed.virtualToolCallEnabled).toBe(true)
    expect(parsed.extensionTemplateVfsSnapshot).toBeNull()
    expect(parsed.workTreeTemplate).toBeNull()
  })

  it('serializes into JSON-safe object', () => {
    const raw = serializeVfsExtensionSettings({
      enabled: false,
      snapshotMaxCount: 3,
      logMaxBytes: 2048,
      virtualToolCallEnabled: false,
      extensionTemplateVfsSnapshot: null,
      workTreeTemplate: null,
    })
    expect(raw).toEqual({
      enabled: false,
      snapshotMaxCount: 3,
      logMaxBytes: 2048,
      virtualToolCallEnabled: false,
      extensionTemplateVfsSnapshot: null,
      workTreeTemplate: null,
    })
  })
})

describe('vfs chat metadata schema', () => {
  it('falls back to defaults for invalid values', () => {
    const parsed = parseVfsChatMetadata({ mounted: 'yes' })
    expect(parsed.mounted).toBe(false)
    expect(parsed.chatVfsSnapshot).not.toBeNull()
    expect(parsed.chatVfsSnapshot.rootId).toBe('root')
    expect(parsed.chatVfsLogs).toEqual([])
    expect(parsed.chatVfsSnapshots).toEqual([])
    expect(parsed.templateInitialized).toBe(false)
  })

  it('serializes into JSON-safe object', () => {
    const snapshot = createEmptyVfsSnapshot()
    const raw = serializeVfsChatMetadata({
      mounted: true,
      chatVfsSnapshot: snapshot,
      chatVfsLogs: [],
      chatVfsSnapshots: [],
      templateInitialized: false,
      workTree: null,
    })
    expect(raw.mounted).toBe(true)
    expect(raw.chatVfsLogs).toEqual([])
    expect(raw.chatVfsSnapshots).toEqual([])
    expect(raw.templateInitialized).toBe(false)
    expect(raw.chatVfsSnapshot).toEqual(snapshot)
    expect(raw).not.toHaveProperty('chatVfsVersions')
  })

  it('drops legacy chatVfsVersions on parse and defaults snapshots', () => {
    const parsed = parseVfsChatMetadata({
      chatVfsVersions: [
        {
          id: 'legacy-1',
          timestamp: Date.parse('2026-05-08T09:00:00.000Z'),
          source: 'manual',
          summary: '/docs/legacy.md',
          changedFiles: ['/docs/legacy.md'],
        },
      ],
    })

    expect(parsed.chatVfsSnapshots).toEqual([])
  })
})
