import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import EditorScreen from '@/app/screens/pure-screens/EditorScreen.vue'
import LineNumberGutter from '@/app/components/pure-components/LineNumberGutter.vue'
import ReaderScreen from '@/app/screens/pure-screens/ReaderScreen.vue'
import SlideshowScreen from '@/app/screens/pure-screens/SlideshowScreen.vue'

function getGutterRows(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('.vfs-line-number-gutter__row')
}

describe('vfs line numbers', () => {
  beforeEach(() => {
    ;(globalThis as { toastr: { error: (message: string) => void } }).toastr = { error: vi.fn() }
  })

  it('expands visual rows with blank continuation rows (VS Code style)', () => {
    const wrapper = mount(LineNumberGutter, {
      props: {
        lineCount: 2,
        scrollTop: 0,
        visualRowHeightPx: 21,
        visualRowCounts: [3, 1],
      },
    })

    const rows = getGutterRows(wrapper)
    expect(rows).toHaveLength(4)
    expect(rows.map((row) => row.text())).toEqual(['1', '', '', '2'])
    expect(rows[0].classes()).not.toContain('vfs-line-number-gutter__row--continuation')
    expect(rows[1].classes()).toContain('vfs-line-number-gutter__row--continuation')
  })

  it('shows editor line numbers for logical lines', () => {
    const wrapper = mount(EditorScreen, {
      props: {
        filePath: '/a.md',
        modelValue: '# a\nb\nc',
        previewMode: false,
        'onUpdate:modelValue': vi.fn(),
        'onUpdate:previewMode': vi.fn(),
      },
    })

    expect(getGutterRows(wrapper).map((line) => line.text()).filter(Boolean)).toEqual(['1', '2', '3'])
  })

  it('hides line numbers in editor preview mode', () => {
    const wrapper = mount(EditorScreen, {
      props: {
        filePath: '/a.md',
        modelValue: 'alpha\nbeta',
        previewMode: true,
        'onUpdate:modelValue': vi.fn(),
        'onUpdate:previewMode': vi.fn(),
      },
    })

    expect(wrapper.find('[data-testid="vfs-line-number-gutter"]').exists()).toBe(false)
    expect(wrapper.find('.vfs-reader').exists()).toBe(true)
  })

  it('recomputes editor line numbers after content changes', async () => {
    const wrapper = mount(EditorScreen, {
      props: {
        filePath: '/a.md',
        modelValue: 'a\nb',
        previewMode: false,
        'onUpdate:modelValue': vi.fn(),
        'onUpdate:previewMode': vi.fn(),
      },
    })

    await wrapper.setProps({ modelValue: 'a\nb\nc' })

    expect(getGutterRows(wrapper).map((line) => line.text()).filter(Boolean)).toEqual(['1', '2', '3'])
  })

  it('syncs editor gutter position with source scroll', async () => {
    const wrapper = mount(EditorScreen, {
      props: {
        filePath: '/a.md',
        modelValue: Array.from({ length: 20 }, (_, index) => `line-${index + 1}`).join('\n'),
        previewMode: false,
        'onUpdate:modelValue': vi.fn(),
        'onUpdate:previewMode': vi.fn(),
      },
      attachTo: document.body,
    })

    const textarea = wrapper.find('textarea.vfs-editor')
    ;(textarea.element as HTMLTextAreaElement).scrollTop = 120
    await textarea.trigger('scroll')

    const gutterContent = wrapper.find('.vfs-line-number-gutter__content')
    expect(getGutterRows(wrapper).length).toBeGreaterThan(0)
    expect(gutterContent.attributes('style')).toContain('translateY(-120px)')
  })

  it('does not render a line gutter in reader preview', () => {
    const wrapper = mount(ReaderScreen, {
      props: {
        html: 'alpha\nbeta\ngamma',
        filePath: '/a.md',
      },
    })

    expect(wrapper.find('[data-testid="vfs-line-number-gutter"]').exists()).toBe(false)
    expect(wrapper.find('.vfs-reader').exists()).toBe(true)
  })

  it('does not render line gutters in slideshow reader pages', async () => {
    const wrapper = mount(SlideshowScreen, {
      props: {
        pages: [
          { path: '/docs/a.md', title: 'A', content: 'one' },
          { path: '/docs/b.md', title: 'B', content: 'one\ntwo\nthree' },
        ],
        pageIndex: 0,
      },
    })

    expect(wrapper.find('[data-testid="vfs-line-number-gutter"]').exists()).toBe(false)

    await wrapper.setProps({ pageIndex: 1 })

    expect(wrapper.find('[data-testid="vfs-line-number-gutter"]').exists()).toBe(false)
    expect(wrapper.find('.vfs-reader').exists()).toBe(true)
  })

  it('keeps numbering correct for 500+ logical lines', () => {
    const content = Array.from({ length: 520 }, (_, index) => `line-${index + 1}`).join('\n')
    const wrapper = mount(EditorScreen, {
      props: {
        filePath: '/a.md',
        modelValue: content,
        previewMode: false,
        'onUpdate:modelValue': vi.fn(),
        'onUpdate:previewMode': vi.fn(),
      },
    })

    const lines = getGutterRows(wrapper).map((line) => line.text()).filter(Boolean)
    expect(lines).toHaveLength(520)
    expect(lines[0]).toBe('1')
    expect(lines[519]).toBe('520')
  })
})
