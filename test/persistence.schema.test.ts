import { describe, expect, it } from 'vitest'
import { parseVfsExtensionSettings, serializeVfsExtensionSettings } from '@/infra/persistence/vfs-extension-settings.schema'
import { parseVfsChatMetadata, serializeVfsChatMetadata } from '@/infra/persistence/vfs-chat-metadata.schema'

describe('vfs extension settings schema', () => {
  it('falls back to defaults for invalid values', () => {
    const parsed = parseVfsExtensionSettings({ enabled: 'nope' })
    expect(parsed.enabled).toBe(true)
    expect(parsed.logMaxBytes).toBe(1024 * 1024)
    expect(parsed.virtualToolCallEnabled).toBe(true)
    expect(parsed.extensionTemplateVfsSnapshot).toBeNull()
  })

  it('serializes into JSON-safe object', () => {
    const raw = serializeVfsExtensionSettings({
      enabled: false,
      logMaxBytes: 2048,
      virtualToolCallEnabled: false,
      extensionTemplateVfsSnapshot: null,
    })
    expect(raw).toEqual({
      enabled: false,
      logMaxBytes: 2048,
      virtualToolCallEnabled: false,
      extensionTemplateVfsSnapshot: null,
    })
  })
})

describe('vfs chat metadata schema', () => {
  it('falls back to defaults for invalid values', () => {
    const parsed = parseVfsChatMetadata({ mounted: 'yes' })
    expect(parsed.mounted).toBe(false)
    expect(parsed.chatVfsSnapshot).toBeNull()
    expect(parsed.chatVfsLogs).toEqual([])
    expect(parsed.chatVfsVersions).toEqual([])
    expect(parsed.templateInitialized).toBe(false)
  })

  it('serializes into JSON-safe object', () => {
    const raw = serializeVfsChatMetadata({
      mounted: true,
      chatVfsSnapshot: null,
      chatVfsLogs: [],
      chatVfsVersions: [],
      templateInitialized: false,
    })
    expect(raw).toEqual({
      mounted: true,
      chatVfsSnapshot: null,
      chatVfsLogs: [],
      chatVfsVersions: [],
      templateInitialized: false,
    })
  })
})
