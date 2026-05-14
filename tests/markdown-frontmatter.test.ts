import { describe, expect, it } from 'vitest'
import { renderSafeMarkdownDocument } from '@/app/services/vfs/renderPipeline'
import {
  escapeHtml,
  parseFrontMatterKeyValueRows,
  splitYamlFrontMatter,
} from '@/domain/markdown/markdown-frontmatter'

describe('splitYamlFrontMatter', () => {
  it('treats documents without an opening fence as body-only', () => {
    const raw = 'hello\n---\n'
    const r = splitYamlFrontMatter(raw)
    expect(r.frontMatterText).toBeNull()
    expect(r.body).toBe(raw)
  })

  it('treats unclosed opening fence as no front matter (matches work-tree fence rules)', () => {
    const raw = '---\na: 1\n'
    const r = splitYamlFrontMatter(raw)
    expect(r.frontMatterText).toBeNull()
    expect(r.body).toBe(raw)
  })

  it('splits a standard fenced document', () => {
    const raw = '---\na: 1\nb: 2\n---\n正文\n'
    const r = splitYamlFrontMatter(raw)
    expect(r.frontMatterText).toBe('a: 1\nb: 2')
    expect(r.body).toBe('正文\n')
  })

  it('uses body length for PRD counting (spaces, punctuation, newlines; excludes FM)', () => {
    const raw = '---\nx: y\n---\n \tHi, 中文。\n\n'
    const { body } = splitYamlFrontMatter(raw)
    expect(body).toBe(' \tHi, 中文。\n\n')
    expect(body.length).toBe(' \tHi, 中文。\n\n'.length)
  })

  it('matches work-tree `frontMatterDisplayLines` hit/miss on the same fence edges', () => {
    const hit = '---\nk: v\n---\nbody'
    expect(splitYamlFrontMatter(hit).frontMatterText).toBe('k: v')
    expect(splitYamlFrontMatter(hit).body).toBe('body')

    const missNoOpen = 'x\n---\n'
    expect(splitYamlFrontMatter(missNoOpen).frontMatterText).toBeNull()

    const missNoClose = '---\nonly'
    expect(splitYamlFrontMatter(missNoClose).frontMatterText).toBeNull()
  })
})

describe('parseFrontMatterKeyValueRows', () => {
  it('treats non-key lines as continuations of the previous value', () => {
    const rows = parseFrontMatterKeyValueRows('k: first\n  continued\nnext: x')
    expect(rows).toEqual([
      { key: 'k', value: 'first\n  continued' },
      { key: 'next', value: 'x' },
    ])
  })
})

describe('escapeHtml', () => {
  it('escapes characters that would break HTML attribute or text boundaries', () => {
    expect(escapeHtml('<a>"&\'')).toBe('&lt;a&gt;&quot;&amp;&#39;')
  })
})

describe('renderSafeMarkdownDocument', () => {
  it('renders front matter outside marked output so FM keys are not folded into an h2', () => {
    const sample = '---\nstory_time: "3"\nsummary: hi\n---\n# Real heading\n'
    const result = renderSafeMarkdownDocument(sample)
    expect(result.ok).toBe(true)
    const html = result.html ?? ''
    expect(html).toContain('vfs-md-frontmatter')
    expect(html).toContain('story_time')
    expect(html).not.toContain('<h2>story_time')
  })
})
