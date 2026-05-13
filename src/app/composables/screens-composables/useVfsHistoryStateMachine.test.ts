import { describe, expect, it } from 'vitest'
import { VFS_ERROR_CODES } from '@/app/constants/vfsErrorCodes'
import { createVfsHistoryStateMachine } from './useVfsHistoryStateMachine'

describe('createVfsHistoryStateMachine', () => {
  it('follows rollback dispatch transitions', () => {
    const machine = createVfsHistoryStateMachine()
    expect(machine.state.status).toBe('idle')
    machine.dispatch({ type: 'ROLLBACK_REQUEST' })
    expect(machine.state.status).toBe('rollingBack')
    machine.dispatch({ type: 'ROLLBACK_SUCCESS' })
    expect(machine.state.status).toBe('succeeded')
  })

  it('records rollback failure metadata', () => {
    const machine = createVfsHistoryStateMachine()
    machine.dispatch({ type: 'ROLLBACK_REQUEST' })
    machine.dispatch({
      type: 'ROLLBACK_FAILED',
      errorCode: VFS_ERROR_CODES.ROLLBACK_FAILED,
      message: 'boom',
    })
    expect(machine.state.status).toBe('failed')
    expect(machine.state.lastErrorCode).toBe(VFS_ERROR_CODES.ROLLBACK_FAILED)
    expect(machine.state.lastMessage).toBe('boom')
  })
})
