<script setup lang="ts">
import { computed, ref } from 'vue'
import { useVfsBatchRollbackAction } from '@/app/composables/components-composables/useVfsRollbackActions'
import type { ChatVfsVersionEntry } from '@/infra/persistence/vfs-chat-metadata.schema'

const props = defineProps<{
  commits: ChatVfsVersionEntry[]
}>()

const selectedIds = ref<Set<string>>(new Set())
const isRollingBack = ref(false)
const feedback = ref<'idle' | 'rollingBack' | 'succeeded' | 'failed'>('idle')
const emits = defineEmits<{
  rollbackStatus: [
    payload: { kind: 'batch'; status: 'rollingBack' | 'succeeded' | 'failed'; sourceVersionIds: string[] },
  ]
}>()

const orderedCommits = computed(() =>
  [...props.commits].sort((left, right) => {
    const leftTime = left.time ? Date.parse(left.time) : (left.timestamp ?? 0)
    const rightTime = right.time ? Date.parse(right.time) : (right.timestamp ?? 0)
    return rightTime - leftTime
  }),
)

function displaySummary(item: ChatVfsVersionEntry): string {
  return item.summary ?? `${item.actionType} · ${item.scope}`
}

function displaySubline(item: ChatVfsVersionEntry): string {
  const timeText = item.time ? new Date(item.time).toLocaleString() : new Date(item.timestamp ?? 0).toLocaleString()
  const actor = item.operator || item.source || 'system'
  return `${timeText} · ${actor} · ${item.actionType} · ${item.scope}`
}

function isSelected(id: string): boolean {
  return selectedIds.value.has(id)
}

function toggleSelected(id: string): void {
  if (isRollingBack.value) return
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedIds.value = next
  feedback.value = 'idle'
}

const orderedSelectedIds = computed(() => {
  const ordered = orderedCommits.value.map((c) => c.id)
  return ordered.filter((id) => selectedIds.value.has(id))
})

async function rollbackBatchToSelected(): Promise<void> {
  if (isRollingBack.value) return
  if (orderedSelectedIds.value.length === 0) return
  isRollingBack.value = true
  feedback.value = 'rollingBack'
  emits('rollbackStatus', { kind: 'batch', status: 'rollingBack', sourceVersionIds: [...orderedSelectedIds.value] })
  try {
    const targets = [...orderedSelectedIds.value]
    const ok = await useVfsBatchRollbackAction(targets)
    feedback.value = ok ? 'succeeded' : 'failed'
    emits('rollbackStatus', { kind: 'batch', status: ok ? 'succeeded' : 'failed', sourceVersionIds: targets })
    if (ok) {
      selectedIds.value = new Set()
    }
  } finally {
    isRollingBack.value = false
  }
}
</script>

<template>
  <section class="vfs-commit-tab">
    <header class="vfs-commit-tab-header">
      <p class="vfs-commit-tab-hint">选择提交记录后执行批量回滚</p>
      <button type="button" :disabled="isRollingBack || orderedSelectedIds.length === 0" @click="rollbackBatchToSelected">
        {{
          isRollingBack
            ? '批量回滚进行中...'
            : feedback === 'succeeded'
              ? '批量回滚成功'
              : feedback === 'failed'
                ? '批量回滚失败'
                : '批量回滚所选提交'
        }}
      </button>
    </header>

    <ul v-if="orderedCommits.length" class="vfs-commit-list">
      <li v-for="item in orderedCommits" :key="item.id" class="vfs-commit-item">
        <label class="vfs-commit-row">
          <input
            type="checkbox"
            :checked="isSelected(item.id)"
            :disabled="isRollingBack"
            @change="toggleSelected(item.id)"
          />
          <span class="vfs-commit-meta">
            <span class="vfs-commit-summary">{{ displaySummary(item) }}</span>
            <span class="vfs-commit-sub">
              {{ displaySubline(item) }} · {{ item.id }}
            </span>
          </span>
        </label>
      </li>
    </ul>

    <p v-else class="vfs-commit-empty">暂无提交记录</p>
  </section>
</template>

<style scoped>
.vfs-commit-tab-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: nowrap;
  gap: 12px;
  margin-bottom: 8px;
  overflow-x: auto;
  min-width: 0;
}
.vfs-commit-tab-hint {
  margin: 0;
  opacity: 0.85;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.vfs-commit-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 6px;
}
.vfs-commit-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.vfs-commit-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.vfs-commit-sub {
  opacity: 0.75;
  font-size: 12px;
}
.vfs-commit-empty {
  margin: 0;
  opacity: 0.75;
}
</style>
