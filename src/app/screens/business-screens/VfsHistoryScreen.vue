<script setup lang="ts">
import { computed, ref } from 'vue'
import VfsCommitTab from '@/app/components/business-components/VfsCommitTab.vue'
import VfsHistoryPanel from '@/app/components/business-components/VfsHistoryPanel.vue'
import {
  createVfsCommitHistoryStore,
  type VfsCommitActionType,
  type VfsCommitHistoryRecord,
} from '@/app/composables/components-composables/useVfsCommitHistory'
import { VFS_ERROR_CODES } from '@/app/constants/vfsErrorCodes'
import { createVfsHistoryStateMachine } from '@/app/composables/screens-composables/useVfsHistoryStateMachine'

const machine = createVfsHistoryStateMachine()
const history = createVfsCommitHistoryStore()
const timeline = ref<VfsCommitHistoryRecord[]>([])

const statusLabel = computed(() => machine.state.status)
const orderedTimeline = computed(() => timeline.value)
const orderedCommitRecords = computed(() => history.records.value)

function markTimeline(actionType: VfsCommitActionType, scope: string, sourceVersionId?: string): void {
  const record: VfsCommitHistoryRecord = {
    time: new Date().toISOString(),
    operator: 'assistant',
    actionType,
    scope,
    sourceVersionId,
  }
  timeline.value = [record, ...timeline.value].slice(0, 20)
  history.appendRecord(record)
}

function onRollbackStatus(payload: {
  kind: 'single' | 'batch'
  status: 'rollingBack' | 'batchRollingBack' | 'succeeded' | 'failed'
  sourceVersionId?: string
}): void {
  if (payload.status === 'rollingBack') {
    machine.dispatch({ type: 'ROLLBACK_REQUEST' })
    markTimeline('rollback', 'history/single', payload.sourceVersionId)
    return
  }
  if (payload.status === 'batchRollingBack') {
    machine.dispatch({ type: 'BATCH_ROLLBACK_REQUEST' })
    markTimeline('batch-rollback', 'history/batch', payload.sourceVersionId)
    return
  }
  if (payload.status === 'succeeded') {
    if (payload.kind === 'batch') {
      machine.dispatch({ type: 'BATCH_ROLLBACK_SUCCESS' })
      markTimeline('trace-rollback', 'history/batch', payload.sourceVersionId)
      return
    }
    machine.dispatch({ type: 'ROLLBACK_SUCCESS' })
    markTimeline('trace-rollback', 'history/single', payload.sourceVersionId)
    return
  }
  if (payload.kind === 'batch') {
    machine.dispatch({
      type: 'BATCH_ROLLBACK_FAILED',
      errorCode: VFS_ERROR_CODES.BATCH_ROLLBACK_FAILED,
      message: 'Batch rollback failed',
    })
    markTimeline('batch-rollback', 'history/batch-failed', payload.sourceVersionId)
    return
  }
  machine.dispatch({
    type: 'ROLLBACK_FAILED',
    errorCode: VFS_ERROR_CODES.ROLLBACK_FAILED,
    message: 'Rollback failed',
  })
  markTimeline('rollback', 'history/single-failed', payload.sourceVersionId)
}
</script>

<template>
  <section class="vfs-history-screen">
    <p class="vfs-history-status">Status: {{ statusLabel }}</p>
    <VfsCommitTab @rollback-status="onRollbackStatus" />
    <VfsHistoryPanel @rollback-status="onRollbackStatus" />
    <ul class="vfs-history-timeline">
      <li v-for="item in orderedTimeline" :key="`${item.time}-${item.scope}`">
        {{ item.time }} {{ item.operator }} {{ item.actionType }} {{ item.scope }} {{ item.sourceVersionId }}
      </li>
    </ul>
    <ul class="vfs-history-commit-list">
      <li v-for="item in orderedCommitRecords" :key="`record-${item.time}-${item.scope}`">
        {{ item.time }} {{ item.operator }} {{ item.actionType }} {{ item.scope }} {{ item.sourceVersionId }}
      </li>
    </ul>
  </section>
</template>
