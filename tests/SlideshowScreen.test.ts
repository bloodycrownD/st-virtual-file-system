import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SlideshowScreen from '@/app/screens/pure-screens/SlideshowScreen.vue'

describe('SlideshowScreen', () => {
  it('renders only current page content without slideshow toolbar controls', () => {
    const wrapper = mount(SlideshowScreen, {
      props: {
        pages: [
          { path: '/docs/a.md', title: 'A', content: '<p>A</p>' },
          { path: '/docs/b.md', title: 'B', content: '<p>B</p>' },
        ],
        pageIndex: 1,
      },
    })

    expect(wrapper.find('[data-testid="directory-select"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="toggle-vertical"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="prev-page"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="next-page"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('B')
    expect(wrapper.text()).not.toContain('A')
  })
})
