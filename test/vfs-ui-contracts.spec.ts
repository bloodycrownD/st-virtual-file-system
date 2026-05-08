import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VFS_ERROR_CODES } from '@/app/constants/vfsErrorCodes'
import { toVfsErrorToast } from '@/app/utils/vfsErrorMapper'
import { createVfsLogPagination, createVfsServerLogPagination } from '@/app/composables/components-composables/useVfsLogPagination'
import { createVfsHistoryStateMachine } from '@/app/composables/screens-composables/useVfsHistoryStateMachine'
import { useVfsRollbackAction } from '@/app/composables/components-composables/useVfsRollbackActions'
import { useVfsPopupLifecycle } from '@/app/composables/screens-composables/useVfsPopupLifecycle'
import ReaderScreen from '@/app/screens/pure-screens/ReaderScreen.vue'
import SlideshowScreen from '@/app/screens/pure-screens/SlideshowScreen.vue'

vi.mock('@/app/services/vfs/rollbackService', () => ({
  rollbackCommit: vi.fn(async () => ({ ok: true })),
  rollbackBatch: vi.fn(async () => ({ ok: true })),
}))

describe('vfs ui contracts', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('formats toastr error with prefixed code', () => {
    const message = toVfsErrorToast(VFS_ERROR_CODES.ROLLBACK_FAILED, 'Rollback failed')
    expect(message).toBe('[E_ROLLBACK_FAILED] Rollback failed')
  })

  it('uses fixed pagination size and clamps pages', () => {
    const pagination = createVfsLogPagination(Array.from({ length: 45 }).map((_, index) => ({ id: index + 1 })))
    expect(pagination.pageSize).toBe(20)
    expect(pagination.totalPages).toBe(3)
    expect(pagination.currentItems.map((item) => item.id)).toEqual(Array.from({ length: 20 }).map((_, index) => index + 1))

    pagination.goToPage(99)
    expect(pagination.currentPage).toBe(3)
    expect(pagination.currentItems.map((item) => item.id)).toEqual(Array.from({ length: 5 }).map((_, index) => index + 41))
  })

  it('computes total pages from global totalItems (server-driven)', () => {
    const pagination = createVfsServerLogPagination({ currentPage: 1, totalItems: 45, pageSize: 20 })
    expect(pagination.totalPages).toBe(3)

    pagination.goToPage(99)
    expect(pagination.currentPage).toBe(3)
  })

  it('tracks history state transitions for save and rollback', () => {
    const machine = createVfsHistoryStateMachine()
    expect(machine.state.status).toBe('idle')

    machine.dispatch({ type: 'SAVE_REQUEST' })
    expect(machine.state.status).toBe('saving')
    machine.dispatch({ type: 'SAVE_SUCCESS' })
    expect(machine.state.status).toBe('succeeded')

    machine.dispatch({ type: 'ROLLBACK_REQUEST' })
    expect(machine.state.status).toBe('rollingBack')
    machine.dispatch({
      type: 'ROLLBACK_FAILED',
      errorCode: VFS_ERROR_CODES.ROLLBACK_FAILED,
      message: 'rollback error',
    })
    expect(machine.state.status).toBe('failed')
    expect(machine.state.lastErrorCode).toBe(VFS_ERROR_CODES.ROLLBACK_FAILED)
  })

  it('sanitizes reader html through shared pipeline', async () => {
    const wrapper = mount(ReaderScreen, {
      props: { html: '<img src=x onerror=alert(1) /><script>alert(1)</script><p>safe</p>' },
    })

    const rendered = wrapper.find('.vfs-reader').html()
    expect(rendered).toContain('<p>safe</p>')
    expect(rendered).not.toContain('onerror=')
    expect(rendered).not.toContain('<script')
  })

  it('emits state refresh event after rollback success', async () => {
    const spy = vi.fn()
    window.addEventListener('VFS_STATE_REFRESH_REQUIRED', spy)

    const ok = await useVfsRollbackAction('commit-1')

    expect(ok).toBe(true)
    expect(spy).toHaveBeenCalledTimes(1)
    window.removeEventListener('VFS_STATE_REFRESH_REQUIRED', spy)
  })

  it('supports slideshow directory switch and paging modes', async () => {
    const wrapper = mount(SlideshowScreen, {
      props: {
        directories: [
          { path: 'dir-a', name: 'A' },
          { path: 'dir-b', name: 'B' },
        ],
        pages: [
          { path: 'a-1', title: 'a-1', content: 'a-1' },
          { path: 'a-2', title: 'a-2', content: 'a-2' },
        ],
        directoryPath: 'dir-a',
      },
    })

    expect(wrapper.text()).toContain('a-1')
    await wrapper.get('[data-testid="next-page"]').trigger('click')
    expect(wrapper.text()).toContain('a-2')
    await wrapper.get('[data-testid="directory-select"]').setValue('dir-b')
    expect(wrapper.emitted('directoryChanged')?.[0]).toEqual(['dir-b'])
    await wrapper.setProps({
      directoryPath: 'dir-b',
      pages: [{ path: 'b-1', title: 'b-1', content: 'b-1' }],
    })
    expect(wrapper.text()).toContain('b-1')
    await wrapper.get('[data-testid="toggle-vertical"]').trigger('click')
    expect(wrapper.get('.vfs-slideshow-screen').classes()).toContain('is-vertical')
  })

  it('mounts vfs vue app into popup shell', () => {
    const popup = useVfsPopupLifecycle()
    popup.open()

    expect(document.querySelector('#st-vfs-popup')).toBeTruthy()
    expect(document.querySelector('.vfs-tab-shell')).toBeTruthy()

    popup.close()
  })

  it('opens template popup with Tab1-only capabilities', () => {
    const popup = useVfsPopupLifecycle()
    popup.open({ scope: 'template', title: '模板管理' })

    const tabs = Array.from(document.querySelectorAll('.vfs-tabs button')).map((button) => button.textContent?.trim() ?? '')
    expect(tabs).toEqual(['文件管理器'])
    expect(document.body.textContent).not.toContain('提交记录')
    expect(document.body.textContent).not.toContain('日志')

    popup.close()
  })
})
