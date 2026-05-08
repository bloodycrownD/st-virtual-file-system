<script setup lang="ts">
import { computed, ref } from 'vue'
import { useVfsRollbackAction } from '@/app/composables/components-composables/useVfsRollbackActions'
import type { ChatVfsVersionEntry } from '@/infra/persistence/vfs-chat-metadata.schema'

const props = defineProps<{
  commits: ChatVfsVersionEntry[]
}>()

const selectedId = ref<string | null>(null)
const isRollingBack = ref(false)
const emits = defineEmits<{
  rollbackStatus: [payload: { kind: 'single'; status: 'rollingBack' | 'succeeded' | 'failed'; sourceVersionId?: string }]
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
  return selectedId.value === id
}

function toggleSelected(id: string): void {
  if (isRollingBack.value) return
  selectedId.value = id
}

async function rollbackSelected(): Promise<void> {
  if (isRollingBack.value) return
  if (!selectedId.value) return
  isRollingBack.value = true
  emits('rollbackStatus', { kind: 'single', status: 'rollingBack' })
  try {
    const targetId = selectedId.value
    const ok = await useVfsRollbackAction(targetId)
    emits('rollbackStatus', { kind: 'single', status: ok ? 'succeeded' : 'failed', sourceVersionId: targetId })
  } finally {
    isRollingBack.value = false
  }
}
</script>

<template>
  <section class="vfs-commit-tab">
    <header class="vfs-commit-tab-header">
      <p class="vfs-commit-tab-hint">选择一个提交记录并回滚到该版本</p>
      <button type="button" :disabled="isRollingBack || !selectedId" @click="rollbackSelected">
        {{ isRollingBack ? '回滚进行中...' : '回滚所选提交' }}
      </button>
    </header>

    <ul v-if="orderedCommits.length" class="vfs-commit-list">
      <li v-for="item in orderedCommits" :key="item.id" class="vfs-commit-item">
        <label class="vfs-commit-row">
          <input
            type="radio"
            :checked="isSelected(item.id)"
            :disabled="isRollingBack"
            name="vfs-commit-target"
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
  gap: 12px;
  margin-bottom: 8px;
}
.vfs-commit-tab-hint {
  margin: 0;
  opacity: 0.85;
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
