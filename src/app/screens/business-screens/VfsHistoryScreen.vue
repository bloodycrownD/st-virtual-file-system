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
  status: 'rollingBack' | 'succeeded' | 'failed'
  sourceVersionId?: string
  sourceVersionIds?: string[]
}): void {
  if (payload.kind === 'batch') {
    if (payload.status === 'rollingBack') {
      machine.dispatch({ type: 'BATCH_ROLLBACK_REQUEST' })
      return
    }
    if (payload.status === 'succeeded') {
      machine.dispatch({ type: 'BATCH_ROLLBACK_SUCCESS' })
      return
    }
    machine.dispatch({
      type: 'BATCH_ROLLBACK_FAILED',
      errorCode: VFS_ERROR_CODES.BATCH_ROLLBACK_FAILED,
      message: 'Batch rollback failed',
    })
    return
  }

  if (payload.status === 'rollingBack') {
    machine.dispatch({ type: 'ROLLBACK_REQUEST' })
    return
  }
  if (payload.status === 'succeeded') {
    machine.dispatch({ type: 'ROLLBACK_SUCCESS' })
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
    <div class="vfs-history-status-bar">
      <span class="vfs-history-status-label">状态</span>
      <span class="vfs-history-status-pill">{{ statusLabel }}</span>
    </div>
    <VfsCommitTab :commits="commits" @rollback-status="onRollbackStatus" />
    <VfsHistoryPanel @rollback-status="onRollbackStatus" />
  </section>
</template>

<style scoped>
.vfs-history-screen {
  display: grid;
  gap: 12px;
}

.vfs-history-status-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 10px;
  background: rgba(20, 24, 32, 0.5);
}

.vfs-history-status-label {
  font-size: 12px;
  opacity: 0.8;
  letter-spacing: 0.02em;
}

.vfs-history-status-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.08);
  font-size: 12px;
  font-weight: 600;
}
</style>
