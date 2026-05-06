import { describe, expect, it } from 'vitest'
import { parseVfsExtensionSettings, serializeVfsExtensionSettings } from '@/infra/persistence/vfs-extension-settings.schema'
import { parseVfsChatMetadata, serializeVfsChatMetadata } from '@/infra/persistence/vfs-chat-metadata.schema'

describe('vfs extension settings schema', () => {
  it('falls back to defaults for invalid values', () => {
    const parsed = parseVfsExtensionSettings({ enabled: 'nope' })
    expect(parsed).toEqual({ enabled: true })
  })

  it('serializes into JSON-safe object', () => {
    const raw = serializeVfsExtensionSettings({ enabled: false })
    expect(raw).toEqual({ enabled: false })
  })
})

describe('vfs chat metadata schema', () => {
  it('falls back to defaults for invalid values', () => {
    const parsed = parseVfsChatMetadata({ mounted: 'yes' })
    expect(parsed).toEqual({ mounted: false })
  })

  it('serializes into JSON-safe object', () => {
    const raw = serializeVfsChatMetadata({ mounted: true })
    expect(raw).toEqual({ mounted: true })
  })
})
