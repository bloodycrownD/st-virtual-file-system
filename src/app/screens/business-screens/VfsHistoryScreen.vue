<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { VFS_ERROR_CODES } from '@/app/constants/vfsErrorCodes'
import { createVfsHistoryStateMachine } from '@/app/composables/screens-composables/useVfsHistoryStateMachine'
import { useVfsSnapshotRollback } from '@/app/composables/components-composables/useVfsSnapshotRollback'
import { vfsPersistenceStore } from '@/app/stores/vfs-store-singleton'
import type { ChatVfsLogEntry } from '@/infra/persistence/vfs-chat-metadata.schema'

const machine = createVfsHistoryStateMachine()
const logs = ref<ChatVfsLogEntry[]>([])
const snapshotMaxCount = ref(0)

const statusLabel = computed(() => machine.state.status)
const rollingBack = computed(
  () => machine.state.status === 'rollingBack' || machine.state.status === 'batchRollingBack',
)

const snapshotMissingTitle = computed(
  () =>
    `还原点记录已不在列表（FIFO，扩展设置「还原点数量上限」为 ${snapshotMaxCount.value}）。日志仍保留 snapshot ID 以便对照。`,
)

let unsubscribe: (() => void) | null = null

function refreshLogs(): void {
  const entries = vfsPersistenceStore.getState().chat.chatVfsLogs
  logs.value = [...entries].reverse()
  const ext = vfsPersistenceStore.getState().extension
  snapshotMaxCount.value = ext?.snapshotMaxCount ?? 10
}

function snapshotExists(snapshotId: string): boolean {
  return vfsPersistenceStore.getState().chat.chatVfsSnapshots.some((row) => row.id === snapshotId)
}

async function rollbackLogSnapshot(snapshotId: string): Promise<void> {
  const id = snapshotId.trim()
  if (!id) return
  // WHY: FIFO eviction — never call apply when the manifest row is gone (avoids toast spam / races).
  if (!snapshotExists(id)) return
  // WHY: align with editor rollback — block duplicate async applies while one is in flight.
  if (machine.state.status === 'rollingBack' || machine.state.status === 'batchRollingBack') return

  machine.dispatch({ type: 'ROLLBACK_REQUEST' })
  try {
    const ok = await useVfsSnapshotRollback(id)
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    machine.dispatch({
      type: 'ROLLBACK_FAILED',
      errorCode: VFS_ERROR_CODES.ROLLBACK_FAILED,
      message,
    })
  } finally {
    // WHY: spec B.2 — if SUCCESS/FAILED dispatch or refresh throws, avoid leaving status stuck at rollingBack.
    const status = machine.state.status as string
    if (status === 'rollingBack' || status === 'batchRollingBack') {
      machine.dispatch({
        type: 'ROLLBACK_FAILED',
        errorCode: VFS_ERROR_CODES.ROLLBACK_FAILED,
        message: 'Rollback ended without completing',
      })
    }
  }
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
  <!-- WHY: flex + min-height:0 participates in dialog flex chain so an inner scrollport can shrink. -->
  <section class="vfs-history-screen">
    <div class="vfs-history-top">
      <div class="vfs-history-status-bar">
        <span class="vfs-history-status-label">状态</span>
        <span class="vfs-history-status-pill">{{ statusLabel }}</span>
        <i v-if="rollingBack" class="fa-solid fa-spinner fa-spin vfs-history-status-spinner" aria-hidden="true" />
      </div>
      <p class="vfs-history-hint">执行日志（含工具批次）。带快照引用的行可回滚到批次前锚点状态。</p>
    </div>
    <!-- WHY: dedicated scrollport — dialog root is overflow:hidden; wheel must terminate here. -->
    <div class="vfs-log-scrollport">
      <ul v-if="logs.length" class="vfs-log-list">
        <li v-for="entry in logs" :key="entry.id" class="vfs-log-row">
          <div class="vfs-log-meta">
            <span class="vfs-log-line">{{ entry.toolName }} · {{ entry.status }} · {{ entry.argsSummary }}</span>
            <span class="vfs-log-sub">{{ new Date(entry.timestamp).toLocaleString() }} · {{ entry.batchId }}</span>
            <span v-if="entry.snapshotId" class="vfs-log-snap">snapshot: {{ entry.snapshotId }}</span>
          </div>
          <div v-if="entry.snapshotId" class="vfs-log-actions">
            <button
              v-if="snapshotExists(entry.snapshotId)"
              type="button"
              class="menu_button vfs-log-rollback"
              data-testid="vfs-log-rollback"
              title="回滚到批次前锚点状态"
              aria-label="回滚到批次前锚点状态"
              :disabled="rollingBack"
              :aria-busy="rollingBack ? 'true' : undefined"
              @click="void rollbackLogSnapshot(entry.snapshotId!)"
            >
              回滚
            </button>
            <div v-else class="vfs-log-snapshot-missing">
              <button
                type="button"
                class="menu_button vfs-log-rollback vfs-log-rollback--disabled"
                data-testid="vfs-log-rollback-missing"
                disabled
                :title="snapshotMissingTitle"
                aria-label="快照已过期"
              >
                快照已过期
              </button>
              <span class="vfs-log-snapshot-missing-hint" :title="snapshotMissingTitle">
                还原点已被 FIFO 移出列表
              </span>
            </div>
          </div>
        </li>
      </ul>
      <p v-else class="vfs-log-empty">暂无日志</p>
    </div>
  </section>
</template>

<style scoped>
.vfs-history-screen {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  gap: 12px;
}

.vfs-history-top {
  flex: 0 0 auto;
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

.vfs-history-status-spinner {
  margin-left: 4px;
  opacity: 0.9;
}

.vfs-history-hint {
  margin: 0;
  font-size: 12px;
  opacity: 0.8;
}

.vfs-log-scrollport {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
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

.vfs-log-actions {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.vfs-log-rollback {
  flex: 0 0 auto;
  white-space: nowrap;
}

.vfs-log-rollback--disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.vfs-log-snapshot-missing {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  max-width: 12rem;
  text-align: right;
}

.vfs-log-snapshot-missing-hint {
  font-size: 11px;
  line-height: 1.25;
  opacity: 0.72;
  word-break: break-word;
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
