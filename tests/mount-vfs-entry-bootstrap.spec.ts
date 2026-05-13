import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mountVfsEntryMock = vi.fn<(() => void) | null, [() => void]>()

vi.mock('@/app/composables/screens-composables/useVfsEntryMount', () => ({
  mountVfsEntry: (onOpen: () => void) => mountVfsEntryMock(onOpen),
}))

vi.mock('@/app/composables/screens-composables/useVfsPopupLifecycle', () => ({
  useVfsPopupLifecycle: () => ({
    open: vi.fn(),
    close: vi.fn(),
    isOpen: () => false,
  }),
}))

vi.mock('@/app/composables/components-composables/useVfsMessageHooks', () => ({
  emitVfsEvent: vi.fn(),
  VFS_POPUP_OPENED: 'VFS_POPUP_OPENED',
}))

describe('mountVfsEntryButton bootstrap', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    mountVfsEntryMock.mockReset()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('keeps remount watcher active after first successful mount', async () => {
    mountVfsEntryMock.mockReturnValue(() => {})
    const { mountVfsEntryButton, unmountVfsEntryButton } = await import('@/app/bootstrap/mountVfsEntry')

    mountVfsEntryButton()
    expect(mountVfsEntryMock).toHaveBeenCalledTimes(1)

    document.body.appendChild(document.createElement('div'))
    await Promise.resolve()
    await Promise.resolve()

    expect(mountVfsEntryMock).toHaveBeenCalledTimes(2)

    unmountVfsEntryButton()
  })
})
