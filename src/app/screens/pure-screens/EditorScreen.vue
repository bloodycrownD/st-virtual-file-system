<script setup lang="ts">
import { computed, ref } from 'vue'
import type { VfsCommitHistoryRecord } from '@/app/composables/components-composables/useVfsCommitHistory'
import ReaderScreen from '@/app/screens/pure-screens/ReaderScreen.vue'

const model = defineModel<string>({ required: true })
const props = withDefaults(
  defineProps<{
    historyRecords?: VfsCommitHistoryRecord[]
    saveInProgress?: boolean
    rollbackInProgress?: boolean
    showHistoryControls?: boolean
  }>(),
  {
    historyRecords: () => [],
    saveInProgress: false,
    rollbackInProgress: false,
    showHistoryControls: true,
  },
)
const emits = defineEmits<{
  manualRollbackRequested: [payload: { sourceVersionId: string }]
  saveRequested: []
}>()
const previewMode = ref(false)
const rollbackSourceVersionId = ref<string | null>(null)
const rollbackOptions = computed(() =>
  props.historyRecords.flatMap((record) => {
    const targetId = record.commitId ?? record.sourceVersionId
    if (!targetId) return []
    return {
      key: `${record.time}-${record.scope}-${targetId}`,
      label: `${record.time} · ${record.actionType} · ${record.scope}`,
      sourceVersionId: targetId,
    }
  }),
)

function requestManualRollback(): void {
  if (!rollbackSourceVersionId.value) return
  emits('manualRollbackRequested', { sourceVersionId: rollbackSourceVersionId.value })
}

function requestSave(): void {
  emits('saveRequested')
}
</script>

<template>
  <section class="vfs-editor-screen">
    <header class="vfs-editor-toolbar">
      <button type="button" @click="previewMode = !previewMode">
        {{ previewMode ? 'Source' : 'Preview' }}
      </button>
      <button data-testid="editor-save-submit" type="button" @click="requestSave">
        {{ props.saveInProgress ? 'Saving...' : 'Save' }}
      </button>
    </header>
    <textarea v-if="!previewMode" v-model="model" class="vfs-editor"></textarea>
    <ReaderScreen v-else :html="model" />
    <aside v-if="props.showHistoryControls" class="vfs-editor-history-panel">
      <h4>History</h4>
      <ul>
        <li v-for="record in props.historyRecords" :key="`${record.time}-${record.scope}`">
          <span>{{ record.time }}</span>
          <span>{{ record.operator }}</span>
          <span>{{ record.actionType }}</span>
          <span>{{ record.scope }}</span>
          <span>{{ record.sourceVersionId }}</span>
        </li>
      </ul>
      <fieldset class="vfs-editor-history-select" data-testid="editor-history-rollback-list">
        <legend>选择历史版本回滚</legend>
        <label v-for="option in rollbackOptions" :key="option.key">
          <input
            :checked="rollbackSourceVersionId === option.sourceVersionId"
            type="radio"
            name="editor-rollback-source"
            :value="option.sourceVersionId"
            @change="rollbackSourceVersionId = option.sourceVersionId"
          />
          <span>{{ option.label }}</span>
        </label>
      </fieldset>
      <button
        data-testid="editor-history-rollback-submit"
        type="button"
        :disabled="!rollbackSourceVersionId"
        @click="requestManualRollback"
      >
        {{ props.rollbackInProgress ? 'Rolling back...' : 'Rollback' }}
      </button>
    </aside>
  </section>
</template>
