import { describe, expect, it } from 'vitest'
import { VFS_ERROR_CODES } from '@/app/constants/vfsErrorCodes'
import { createVfsHistoryStateMachine } from '@/app/composables/screens-composables/useVfsHistoryStateMachine'

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

  it('follows save dispatch transitions', () => {
    const machine = createVfsHistoryStateMachine()
    expect(machine.state.status).toBe('idle')
    machine.dispatch({ type: 'SAVE_REQUEST' })
    expect(machine.state.status).toBe('saving')
    machine.dispatch({ type: 'SAVE_SUCCESS' })
    expect(machine.state.status).toBe('succeeded')
    expect(machine.state.lastErrorCode).toBeUndefined()
    expect(machine.state.lastMessage).toBeUndefined()
  })

  it('records save failure metadata', () => {
    const machine = createVfsHistoryStateMachine()
    machine.dispatch({ type: 'SAVE_REQUEST' })
    machine.dispatch({
      type: 'SAVE_FAILED',
      errorCode: VFS_ERROR_CODES.SAVE_FAILED,
      message: 'disk full',
    })
    expect(machine.state.status).toBe('failed')
    expect(machine.state.lastErrorCode).toBe(VFS_ERROR_CODES.SAVE_FAILED)
    expect(machine.state.lastMessage).toBe('disk full')
  })

  it('follows batch rollback dispatch transitions', () => {
    const machine = createVfsHistoryStateMachine()
    expect(machine.state.status).toBe('idle')
    machine.dispatch({ type: 'BATCH_ROLLBACK_REQUEST' })
    expect(machine.state.status).toBe('batchRollingBack')
    machine.dispatch({ type: 'BATCH_ROLLBACK_SUCCESS' })
    expect(machine.state.status).toBe('succeeded')
    expect(machine.state.lastErrorCode).toBeUndefined()
    expect(machine.state.lastMessage).toBeUndefined()
  })

  it('records batch rollback failure metadata', () => {
    const machine = createVfsHistoryStateMachine()
    machine.dispatch({ type: 'BATCH_ROLLBACK_REQUEST' })
    machine.dispatch({
      type: 'BATCH_ROLLBACK_FAILED',
      errorCode: VFS_ERROR_CODES.BATCH_ROLLBACK_FAILED,
      message: 'batch apply rejected',
    })
    expect(machine.state.status).toBe('failed')
    expect(machine.state.lastErrorCode).toBe(VFS_ERROR_CODES.BATCH_ROLLBACK_FAILED)
    expect(machine.state.lastMessage).toBe('batch apply rejected')
  })
})
