<script setup lang="ts">
import { computed, ref } from 'vue'
import VfsCommitTab from '@/app/components/business-components/VfsCommitTab.vue'
import VfsHistoryPanel from '@/app/components/business-components/VfsHistoryPanel.vue'
import { createVfsHistoryStateMachine } from '@/app/composables/screens-composables/useVfsHistoryStateMachine'

const machine = createVfsHistoryStateMachine()
const timeline = ref<string[]>([])

const statusLabel = computed(() => machine.state.status)

function markTimeline(message: string): void {
  timeline.value.unshift(`${new Date().toISOString()} ${message}`)
  timeline.value = timeline.value.slice(0, 20)
}

function onRollbackStatus(status: 'rollingBack' | 'batchRollingBack' | 'succeeded' | 'failed'): void {
  if (status === 'rollingBack') {
    machine.dispatch({ type: 'ROLLBACK_REQUEST' })
    markTimeline('Single rollback started')
    return
  }
  if (status === 'batchRollingBack') {
    machine.dispatch({ type: 'BATCH_ROLLBACK_REQUEST' })
    markTimeline('Batch rollback started')
    return
  }
  if (status === 'succeeded') {
    machine.dispatch({ type: 'ROLLBACK_SUCCESS' })
    markTimeline('Rollback applied and recorded as new commit')
    return
  }
  machine.dispatch({ type: 'ROLLBACK_FAILED', errorCode: 'E_ROLLBACK_FAILED', message: 'Rollback failed' })
  markTimeline('Rollback failed')
}
</script>

<template>
  <section class="vfs-history-screen">
    <p class="vfs-history-status">Status: {{ statusLabel }}</p>
    <VfsCommitTab @rollback-status="onRollbackStatus" />
    <VfsHistoryPanel @rollback-status="onRollbackStatus" />
    <ul class="vfs-history-timeline">
      <li v-for="item in timeline" :key="item">{{ item }}</li>
    </ul>
  </section>
</template>
