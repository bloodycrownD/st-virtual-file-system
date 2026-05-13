import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import App from '@/App.vue'

const openPopupMock = vi.fn()
const startMock = vi.fn()
const stopMock = vi.fn()
const enabledRef = ref(true)

vi.mock('@/app/composables/screens-composables/useVfsPopupLifecycle', () => ({
  useVfsPopupLifecycle: () => ({
    open: openPopupMock,
    close: vi.fn(),
    isOpen: () => false,
  }),
}))

vi.mock('@/infra/sillytarvern/events/st-event-adapter', () => ({
  createStMessageEventAdapter: () => ({
    start: startMock,
    stop: stopMock,
    isStarted: () => true,
  }),
}))

vi.mock('@/app/stores/vfs-store-singleton', () => ({
  initVfsPersistenceStore: vi.fn(),
  vfsPersistenceStore: {
    getState: () => ({
      extension: {
        enabled: enabledRef.value,
      },
    }),
    setExtensionEnabled: vi.fn((next: boolean) => {
      enabledRef.value = next
    }),
    subscribe: vi.fn((listener: (state: { extension: { enabled: boolean } }) => void) => {
      listener({ extension: { enabled: enabledRef.value } })
      return () => {}
    }),
  },
}))

describe('vfs settings entry', () => {
  beforeEach(() => {
    openPopupMock.mockReset()
    startMock.mockReset()
    stopMock.mockReset()
    enabledRef.value = true
  })

  it('opens template manager popup from settings entry', async () => {
    const wrapper = mount(App)
    const button = wrapper.get('.vfs-actions .menu_button')

    await button.trigger('click')

    expect(openPopupMock).toHaveBeenCalledWith({ scope: 'template', title: '模板管理' })
  })
})
