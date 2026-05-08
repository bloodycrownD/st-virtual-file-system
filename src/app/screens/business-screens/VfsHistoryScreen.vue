<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import VfsCommitTab from '@/app/components/business-components/VfsCommitTab.vue'
import VfsHistoryPanel from '@/app/components/business-components/VfsHistoryPanel.vue'
import { VFS_ERROR_CODES } from '@/app/constants/vfsErrorCodes'
import { createVfsHistoryStateMachine } from '@/app/composables/screens-composables/useVfsHistoryStateMachine'
import { vfsPersistenceStore } from '@/app/stores/vfs-store-singleton'
import type { ChatVfsVersionEntry } from '@/infra/persistence/vfs-chat-metadata.schema'

const machine = createVfsHistoryStateMachine()
const commits = ref<ChatVfsVersionEntry[]>([])

const statusLabel = computed(() => machine.state.status)

let unsubscribe: (() => void) | null = null

function refreshCommits(): void {
  commits.value = vfsPersistenceStore.getState().chat.chatVfsVersions
}

onMounted(() => {
  refreshCommits()
  unsubscribe = vfsPersistenceStore.subscribe(() => {
    refreshCommits()
  })
})

onUnmounted(() => {
  unsubscribe?.()
  unsubscribe = null
})

function onRollbackStatus(payload: {
  kind: 'single' | 'batch'
  status: 'rollingBack' | 'batchRollingBack' | 'succeeded' | 'failed'
  sourceVersionId?: string
}): void {
  if (payload.status === 'rollingBack') {
    machine.dispatch({ type: 'ROLLBACK_REQUEST' })
    return
  }
  if (payload.status === 'batchRollingBack') {
    machine.dispatch({ type: 'BATCH_ROLLBACK_REQUEST' })
    return
  }
  if (payload.status === 'succeeded') {
    if (payload.kind === 'batch') {
      machine.dispatch({ type: 'BATCH_ROLLBACK_SUCCESS' })
      return
    }
    machine.dispatch({ type: 'ROLLBACK_SUCCESS' })
    return
  }
  if (payload.kind === 'batch') {
    machine.dispatch({
      type: 'BATCH_ROLLBACK_FAILED',
      errorCode: VFS_ERROR_CODES.BATCH_ROLLBACK_FAILED,
      message: 'Batch rollback failed',
    })
    return
  }
  machine.dispatch({
    type: 'ROLLBACK_FAILED',
    errorCode: VFS_ERROR_CODES.ROLLBACK_FAILED,
    message: 'Rollback failed',
  })
}
</script>

<template>
  <section class="vfs-history-screen">
    <p class="vfs-history-status">Status: {{ statusLabel }}</p>
    <VfsCommitTab :commits="commits" @rollback-status="onRollbackStatus" />
    <VfsHistoryPanel @rollback-status="onRollbackStatus" />
  </section>
</template>
