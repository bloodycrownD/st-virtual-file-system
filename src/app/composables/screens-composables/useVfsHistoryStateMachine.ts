import { reactive } from 'vue'
import type { VfsErrorCode } from '@/app/constants/vfsErrorCodes'

type VfsHistoryStatus = 'idle' | 'saving' | 'rollingBack' | 'batchRollingBack' | 'failed' | 'succeeded'

type VfsHistoryEvent =
  | { type: 'SAVE_REQUEST' }
  | { type: 'SAVE_SUCCESS' }
  | { type: 'SAVE_FAILED'; errorCode: VfsErrorCode; message: string }
  | { type: 'ROLLBACK_REQUEST' }
  | { type: 'ROLLBACK_SUCCESS' }
  | { type: 'ROLLBACK_FAILED'; errorCode: VfsErrorCode; message: string }
  | { type: 'BATCH_ROLLBACK_REQUEST' }
  | { type: 'BATCH_ROLLBACK_SUCCESS' }
  | { type: 'BATCH_ROLLBACK_FAILED'; errorCode: VfsErrorCode; message: string }

interface VfsHistoryState {
  status: VfsHistoryStatus
  lastErrorCode?: VfsErrorCode
  lastMessage?: string
}

export function createVfsHistoryStateMachine() {
  // WHY: plain object mutations are invisible to Vue; reactive wrapper keeps status pills in sync.
  const state = reactive<VfsHistoryState>({ status: 'idle' })

  const markFailed = (errorCode: VfsErrorCode, message: string) => {
    state.status = 'failed'
    state.lastErrorCode = errorCode
    state.lastMessage = message
  }

  const markSuccess = () => {
    state.status = 'succeeded'
    state.lastErrorCode = undefined
    state.lastMessage = undefined
  }

  const dispatch = (event: VfsHistoryEvent) => {
    switch (event.type) {
      case 'SAVE_REQUEST':
        state.status = 'saving'
        return
      case 'SAVE_SUCCESS':
        markSuccess()
        return
      case 'SAVE_FAILED':
        markFailed(event.errorCode, event.message)
        return
      case 'ROLLBACK_REQUEST':
        state.status = 'rollingBack'
        return
      case 'ROLLBACK_SUCCESS':
        markSuccess()
        return
      case 'ROLLBACK_FAILED':
        markFailed(event.errorCode, event.message)
        return
      case 'BATCH_ROLLBACK_REQUEST':
        state.status = 'batchRollingBack'
        return
      case 'BATCH_ROLLBACK_SUCCESS':
        markSuccess()
        return
      case 'BATCH_ROLLBACK_FAILED':
        markFailed(event.errorCode, event.message)
        return
    }
  }

  return {
    state,
    dispatch,
  }
}
