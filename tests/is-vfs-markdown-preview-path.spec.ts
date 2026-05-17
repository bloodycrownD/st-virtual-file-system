import { describe, expect, it } from 'vitest'
import { isVfsMarkdownPreviewPath } from '@/domain/vfs/is-vfs-markdown-preview-path'

describe('isVfsMarkdownPreviewPath', () => {
  it('T-MD-01: treats .md extension as markdown preview (case-insensitive)', () => {
    expect(isVfsMarkdownPreviewPath('/notes/a.md')).toBe(true)
    expect(isVfsMarkdownPreviewPath('/notes/a.MD')).toBe(true)
  })

  it('T-MD-02: does not treat .markdown as markdown preview', () => {
    expect(isVfsMarkdownPreviewPath('/notes/a.markdown')).toBe(false)
  })

  it('T-MD-03: does not treat other extensions or directories as markdown preview', () => {
    expect(isVfsMarkdownPreviewPath('/notes/readme.txt')).toBe(false)
    expect(isVfsMarkdownPreviewPath('/')).toBe(false)
    expect(isVfsMarkdownPreviewPath('')).toBe(false)
    expect(isVfsMarkdownPreviewPath('/dir')).toBe(false)
  })
})
