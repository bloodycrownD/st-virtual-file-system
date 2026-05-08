import { describe, expect, it } from 'vitest'
import { VFS_ERROR_CODES } from '@/app/constants/vfsErrorCodes'
import { toVfsErrorToast } from '@/app/utils/vfsErrorMapper'
import { createVfsLogPagination } from '@/app/composables/components-composables/useVfsLogPagination'
import { createVfsHistoryStateMachine } from '@/app/composables/screens-composables/useVfsHistoryStateMachine'

describe('vfs ui contracts', () => {
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
})
