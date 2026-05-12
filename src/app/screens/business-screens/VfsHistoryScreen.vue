<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { VFS_ERROR_CODES } from '@/app/constants/vfsErrorCodes'
import { createVfsHistoryStateMachine } from '@/app/composables/screens-composables/useVfsHistoryStateMachine'
import { useVfsSnapshotRollback } from '@/app/composables/components-composables/useVfsSnapshotRollback'
import { vfsPersistenceStore } from '@/app/stores/vfs-store-singleton'
import type { ChatVfsLogEntry } from '@/infra/persistence/vfs-chat-metadata.schema'

const machine = createVfsHistoryStateMachine()
const logs = ref<ChatVfsLogEntry[]>([])

const statusLabel = computed(() => machine.state.status)

let unsubscribe: (() => void) | null = null

function refreshLogs(): void {
  const entries = vfsPersistenceStore.getState().chat.chatVfsLogs
  logs.value = [...entries].reverse()
}

function snapshotExists(snapshotId: string): boolean {
  return vfsPersistenceStore.getState().chat.chatVfsSnapshots.some((row) => row.id === snapshotId)
}

async function rollbackLogSnapshot(snapshotId: string): Promise<void> {
  if (!snapshotId.trim()) return
  machine.dispatch({ type: 'ROLLBACK_REQUEST' })
  const ok = await useVfsSnapshotRollback(snapshotId.trim())
  if (ok) {
    machine.dispatch({ type: 'ROLLBACK_SUCCESS' })
    refreshLogs()
    return
  }
  machine.dispatch({
    type: 'ROLLBACK_FAILED',
    errorCode: VFS_ERROR_CODES.ROLLBACK_FAILED,
    message: 'Snapshot rollback failed',
  })
}

onMounted(() => {
  refreshLogs()
  unsubscribe = vfsPersistenceStore.subscribe(() => {
    refreshLogs()
  })
})

onUnmounted(() => {
  unsubscribe?.()
  unsubscribe = null
})
</script>

<template>
  <section class="vfs-history-screen">
    <div class="vfs-history-status-bar">
      <span class="vfs-history-status-label">状态</span>
      <span class="vfs-history-status-pill">{{ statusLabel }}</span>
    </div>
    <p class="vfs-history-hint">执行日志（含工具批次）。带快照引用的行可回滚到批次前锚点状态。</p>
    <ul v-if="logs.length" class="vfs-log-list">
      <li v-for="entry in logs" :key="entry.id" class="vfs-log-row">
        <div class="vfs-log-meta">
          <span class="vfs-log-line">{{ entry.toolName }} · {{ entry.status }} · {{ entry.argsSummary }}</span>
          <span class="vfs-log-sub">{{ new Date(entry.timestamp).toLocaleString() }} · {{ entry.batchId }}</span>
          <span v-if="entry.snapshotId" class="vfs-log-snap">snapshot: {{ entry.snapshotId }}</span>
        </div>
        <button
          v-if="entry.snapshotId && snapshotExists(entry.snapshotId)"
          type="button"
          class="menu_button vfs-log-rollback"
          data-testid="vfs-log-rollback"
          @click="void rollbackLogSnapshot(entry.snapshotId!)"
        >
          回滚
        </button>
      </li>
    </ul>
    <p v-else class="vfs-log-empty">暂无日志</p>
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

.vfs-history-hint {
  margin: 0;
  font-size: 12px;
  opacity: 0.8;
}

.vfs-log-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 8px;
}

.vfs-log-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
}

.vfs-log-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.vfs-log-line {
  font-size: 13px;
  word-break: break-word;
}

.vfs-log-sub,
.vfs-log-snap {
  font-size: 12px;
  opacity: 0.75;
  word-break: break-all;
}

.vfs-log-rollback {
  flex: 0 0 auto;
  white-space: nowrap;
}

.vfs-log-empty {
  margin: 0;
  opacity: 0.75;
  padding: 12px;
  border: 1px dashed rgba(255, 255, 255, 0.2);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
}
</style>
