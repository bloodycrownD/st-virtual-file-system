<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { VFS_ERROR_CODES } from '@/app/constants/vfsErrorCodes'
import { createVfsHistoryStateMachine } from '@/app/composables/screens-composables/useVfsHistoryStateMachine'
import { useVfsSnapshotRollback } from '@/app/composables/components-composables/useVfsSnapshotRollback'
import { vfsPersistenceStore } from '@/app/stores/vfs-store-singleton'
import type { ChatVfsSnapshotRecord } from '@/domain/vfs-snapshot/vfs-snapshot-types'
import type { ChatVfsLogEntry } from '@/infra/persistence/vfs-chat-metadata.schema'

const machine = createVfsHistoryStateMachine()
const logs = ref<ChatVfsLogEntry[]>([])
const snapshotMaxCount = ref(0)

/** WHY: state machine keeps English ids; surface Chinese product copy (撤回 vs 回滚) in the UI. */
const statusLabelZh = computed(() => {
  switch (machine.state.status) {
    case 'idle':
      return '空闲'
    case 'saving':
      return '保存中'
    case 'rollingBack':
      return '撤回中'
    case 'batchRollingBack':
      return '批次撤回中'
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

/**
 * Tool-batch pre manifests for pure-create batches store only `absent` anchors (paths did not exist before the batch).
 * Withdrawing to that anchor restores pre-batch state — it cannot resurrect a file the user deleted later; it matches "undo create".
 */
function isToolBatchCreateOnlyManifest(record: ChatVfsSnapshotRecord | undefined): boolean {
  return Boolean(
    record &&
      record.kind === 'tool-batch-pre' &&
      record.entries.length > 0 &&
      record.entries.every((e) => e.presence === 'absent'),
  )
}

function snapshotRecordById(snapshotId: string): ChatVfsSnapshotRecord | undefined {
  return vfsPersistenceStore.getState().chat.chatVfsSnapshots.find((row) => row.id === snapshotId)
}

async function rollbackLogSnapshot(snapshotId: string): Promise<void> {
  const id = snapshotId.trim()
  if (!id) return
  // WHY: FIFO eviction / TOCTOU — manifest row gone; do not call apply (useVfsSnapshotRollback would toast error too).
  if (!snapshotExists(id)) {
    toastr.warning('该还原点已不可用（可能刚被 FIFO 移出列表），本次未执行撤回。')
    return
  }
  // WHY: align with editor toolbar — block duplicate async applies while one is in flight.
  if (machine.state.status === 'rollingBack' || machine.state.status === 'batchRollingBack') {
    toastr.info('已有撤回正在进行，请稍候。')
    return
  }

  machine.dispatch({ type: 'ROLLBACK_REQUEST' })
  const preApplyRecord = snapshotRecordById(id)
  const createOnlyRollback = isToolBatchCreateOnlyManifest(preApplyRecord)
  let rollbackSucceeded = false
  try {
    const ok = await useVfsSnapshotRollback(id)
    if (ok) {
      machine.dispatch({ type: 'ROLLBACK_SUCCESS' })
      rollbackSucceeded = true
    } else {
      machine.dispatch({
        type: 'ROLLBACK_FAILED',
        errorCode: VFS_ERROR_CODES.ROLLBACK_FAILED,
        message: 'Snapshot rollback failed',
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
  // WHY: refresh is UI-only; failures here must not overwrite a successful withdraw state.
  if (rollbackSucceeded) {
    try {
      refreshLogs()
    } catch {
      /* refreshLogs is sync and non-throwing today; swallow defensively for audit semantics */
    }
    // WHY: apply + store refresh are silent; explain pure-create rollback so users are not surprised when files stay gone.
    toastr.success(
      createOnlyRollback
        ? '已撤回到该批次执行前的锚点。该批次在涉及路径上为「新建」，批次前这些路径本不存在，因此不会恢复你之后手动删除的文件（等价于撤销这次新建）。'
        : '已撤回到该批次执行前的锚点。',
    )
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
        <span class="vfs-history-status-pill">{{ statusLabelZh }}</span>
        <i v-if="rollingBack" class="fa-solid fa-spinner fa-spin vfs-history-status-spinner" aria-hidden="true" />
      </div>
      <p class="vfs-history-hint">
        执行日志（含工具批次）。带快照引用的行可<strong>撤回</strong>到<strong>该批次执行前</strong>的虚拟树锚点（撤销该批次对树的改动）。若批次为<strong>新建路径</strong>，撤回后这些路径会回到「不存在」状态，不会把你之后手动删除的文件再写回来。若你要的是「回到工具批次<strong>执行完成后</strong>」的检查点，需要另行提供「批次后」还原能力（当前未实现）。
      </p>
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
              title="撤回到该批次执行前的锚点（撤销该批次；新建路径会被撤销存在，不恢复其后手动删除）"
              aria-label="撤回到该批次执行前的锚点"
              :disabled="rollingBack"
              :aria-busy="rollingBack ? 'true' : undefined"
              @click="void rollbackLogSnapshot(entry.snapshotId!)"
            >
              撤回
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
