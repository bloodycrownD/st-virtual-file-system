<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { VFS_ERROR_CODES } from '@/app/constants/vfsErrorCodes'
import { createVfsHistoryStateMachine } from '@/app/composables/screens-composables/useVfsHistoryStateMachine'
import { useVfsCheckpointRollback } from '@/app/composables/components-composables/useVfsCheckpointRollback'
import { vfsPersistenceStore } from '@/app/stores/vfs-store-singleton'
import type { ChatVfsLogEntry } from '@/infra/persistence/vfs-chat-metadata.schema'

const machine = createVfsHistoryStateMachine()
const logs = ref<ChatVfsLogEntry[]>([])
const checkpointMaxCount = ref(0)

const statusLabelZh = computed(() => {
  switch (machine.state.status) {
    case 'idle':
      return '空闲'
    case 'saving':
      return '保存中'
    case 'rollingBack':
      return '回滚中'
    case 'batchRollingBack':
      return '批次回滚中'
    case 'failed':
      return '失败'
    case 'succeeded':
      return '成功'
    default:
      return machine.state.status
  }
})
const rollingBack = computed(
  () => machine.state.status === 'rollingBack' || machine.state.status === 'batchRollingBack',
)

const checkpointMissingTitle = computed(
  () =>
    `检查点记录已不在列表（FIFO，扩展设置「还原点数量上限」为 ${checkpointMaxCount.value}）。日志仍保留 checkpoint ID 以便对照。`,
)

let unsubscribe: (() => void) | null = null

function refreshLogs(): void {
  const entries = vfsPersistenceStore.getState().chat.chatVfsLogs
  logs.value = [...entries].reverse()
  const ext = vfsPersistenceStore.getState().extension
  checkpointMaxCount.value = ext?.snapshotMaxCount ?? 10
}

function checkpointExists(checkpointId: string): boolean {
  return vfsPersistenceStore.getState().chat.vfsCheckpoints.some((row) => row.id === checkpointId)
}

async function rollbackLogCheckpoint(checkpointId: string): Promise<void> {
  const id = checkpointId.trim()
  if (!id) return
  if (!checkpointExists(id)) {
    toastr.warning('该检查点已不可用（可能刚被 FIFO 移出列表），本次未执行回滚。')
    return
  }
  if (machine.state.status === 'rollingBack' || machine.state.status === 'batchRollingBack') {
    toastr.info('已有回滚正在进行，请稍候。')
    return
  }

  machine.dispatch({ type: 'ROLLBACK_REQUEST' })
  let rollbackSucceeded = false
  try {
    const ok = await useVfsCheckpointRollback(id)
    if (ok) {
      machine.dispatch({ type: 'ROLLBACK_SUCCESS' })
      rollbackSucceeded = true
    } else {
      machine.dispatch({
        type: 'ROLLBACK_FAILED',
        errorCode: VFS_ERROR_CODES.ROLLBACK_FAILED,
        message: 'Checkpoint rollback failed',
      })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    machine.dispatch({
      type: 'ROLLBACK_FAILED',
      errorCode: VFS_ERROR_CODES.ROLLBACK_FAILED,
      message,
    })
  } finally {
    const status = machine.state.status as string
    if (status === 'rollingBack' || status === 'batchRollingBack') {
      machine.dispatch({
        type: 'ROLLBACK_FAILED',
        errorCode: VFS_ERROR_CODES.ROLLBACK_FAILED,
        message: 'Rollback ended without completing',
      })
    }
  }
  if (rollbackSucceeded) {
    try {
      refreshLogs()
    } catch {
      /* refreshLogs is sync and non-throwing today; swallow defensively for audit semantics */
    }
    toastr.success('已回滚到该检查点提交后的虚拟树状态。')
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
  <section class="vfs-history-screen">
    <div class="vfs-history-top">
      <div class="vfs-history-status-bar">
        <span class="vfs-history-status-label">状态</span>
        <span class="vfs-history-status-pill">{{ statusLabelZh }}</span>
        <i v-if="rollingBack" class="fa-solid fa-spinner fa-spin vfs-history-status-spinner" aria-hidden="true" />
      </div>
      <p class="vfs-history-hint">
        执行日志（含工具批次）。带<strong>检查点</strong>引用的批次行可将整棵虚拟树<strong>回滚</strong>到该次<strong>成功提交之后</strong>的物化结果；未列出的路径视为不存在，因此回到较早检查点会移除之后新增的路径。
      </p>
    </div>
    <div class="vfs-log-scrollport">
      <ul v-if="logs.length" class="vfs-log-list">
        <li v-for="entry in logs" :key="entry.id" class="vfs-log-row">
          <div class="vfs-log-meta">
            <span class="vfs-log-line">{{ entry.toolName }} · {{ entry.status }} · {{ entry.argsSummary }}</span>
            <span class="vfs-log-sub">{{ new Date(entry.timestamp).toLocaleString() }} · {{ entry.batchId }}</span>
            <span v-if="entry.checkpointId" class="vfs-log-snap">checkpoint: {{ entry.checkpointId }}</span>
          </div>
          <div v-if="entry.checkpointId" class="vfs-log-actions">
            <button
              v-if="checkpointExists(entry.checkpointId)"
              type="button"
              class="menu_button vfs-log-rollback"
              data-testid="vfs-log-rollback"
              title="回滚到该检查点提交后的整树状态"
              aria-label="回滚到该检查点提交后的整树状态"
              :disabled="rollingBack"
              :aria-busy="rollingBack ? 'true' : undefined"
              @click="void rollbackLogCheckpoint(entry.checkpointId!)"
            >
              回滚
            </button>
            <div v-else class="vfs-log-snapshot-missing">
              <button
                type="button"
                class="menu_button vfs-log-rollback vfs-log-rollback--disabled"
                data-testid="vfs-log-rollback-missing"
                disabled
                :title="checkpointMissingTitle"
                aria-label="检查点已过期"
              >
                检查点已过期
              </button>
              <span class="vfs-log-snapshot-missing-hint" :title="checkpointMissingTitle">
                检查点已被 FIFO 移出列表
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
