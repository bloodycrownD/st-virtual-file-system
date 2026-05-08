<script setup lang="ts">
import { computed, ref } from 'vue'
import { useVfsBatchRollbackAction } from '@/app/composables/components-composables/useVfsRollbackActions'
import type { ChatVfsVersionEntry } from '@/infra/persistence/vfs-chat-metadata.schema'

const props = defineProps<{
  commits: ChatVfsVersionEntry[]
}>()

const selectedIds = ref<string[]>([])
const isRollingBack = ref(false)
const emits = defineEmits<{
  rollbackStatus: [payload: { kind: 'batch'; status: 'batchRollingBack' | 'succeeded' | 'failed'; sourceVersionId?: string }]
}>()

const orderedCommits = computed(() =>
  [...props.commits].sort((left, right) => right.timestamp - left.timestamp),
)

function isSelected(id: string): boolean {
  return selectedIds.value.includes(id)
}

function toggleSelected(id: string): void {
  if (isRollingBack.value) return
  if (isSelected(id)) {
    selectedIds.value = selectedIds.value.filter((item) => item !== id)
    return
  }
  selectedIds.value = [...selectedIds.value, id]
}

async function rollbackSelected(): Promise<void> {
  if (isRollingBack.value) return
  if (selectedIds.value.length === 0) return
  isRollingBack.value = true
  emits('rollbackStatus', { kind: 'batch', status: 'batchRollingBack' })
  try {
    const ok = await useVfsBatchRollbackAction(selectedIds.value)
    emits('rollbackStatus', { kind: 'batch', status: ok ? 'succeeded' : 'failed', sourceVersionId: selectedIds.value[0] })
  } finally {
    isRollingBack.value = false
  }
}
</script>

<template>
  <section class="vfs-commit-tab">
    <header class="vfs-commit-tab-header">
      <p class="vfs-commit-tab-hint">选择提交记录后执行批量回滚</p>
      <button type="button" :disabled="isRollingBack || selectedIds.length === 0" @click="rollbackSelected">
        {{ isRollingBack ? '回滚进行中...' : `批量回滚（${selectedIds.length}）` }}
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
            <span class="vfs-commit-summary">{{ item.summary }}</span>
            <span class="vfs-commit-sub">
              {{ new Date(item.timestamp).toLocaleString() }} · {{ item.source }} · {{ item.id }}
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
