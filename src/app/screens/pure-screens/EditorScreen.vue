<script setup lang="ts">
import { ref } from 'vue'
import type { VfsCommitHistoryRecord } from '@/app/composables/components-composables/useVfsCommitHistory'
import ReaderScreen from '@/app/screens/pure-screens/ReaderScreen.vue'

const model = defineModel<string>({ required: true })
const props = withDefaults(
  defineProps<{
    historyRecords?: VfsCommitHistoryRecord[]
    saveInProgress?: boolean
    rollbackInProgress?: boolean
  }>(),
  {
    historyRecords: () => [],
    saveInProgress: false,
    rollbackInProgress: false,
  },
)
const emits = defineEmits<{
  manualRollbackRequested: [payload: { sourceVersionId: string }]
  saveRequested: []
}>()
const previewMode = ref(false)
const rollbackSourceVersionId = ref('')

function requestManualRollback(): void {
  if (!rollbackSourceVersionId.value.trim() || props.rollbackInProgress) return
  emits('manualRollbackRequested', { sourceVersionId: rollbackSourceVersionId.value.trim() })
}

function requestSave(): void {
  if (props.saveInProgress) return
  emits('saveRequested')
}
</script>

<template>
  <section class="vfs-editor-screen">
    <header class="vfs-editor-toolbar">
      <button type="button" @click="previewMode = !previewMode">
        {{ previewMode ? 'Source' : 'Preview' }}
      </button>
      <button data-testid="editor-save-submit" type="button" :disabled="props.saveInProgress" @click="requestSave">
        {{ props.saveInProgress ? 'Saving...' : 'Save' }}
      </button>
    </header>
    <textarea v-if="!previewMode" v-model="model" class="vfs-editor"></textarea>
    <ReaderScreen v-else :html="model" />
    <aside class="vfs-editor-history-panel">
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
      <input
        v-model="rollbackSourceVersionId"
        data-testid="editor-history-rollback-id"
        type="text"
        placeholder="source version id"
      />
      <button
        data-testid="editor-history-rollback-submit"
        type="button"
        :disabled="props.rollbackInProgress"
        @click="requestManualRollback"
      >
        {{ props.rollbackInProgress ? 'Rolling back...' : 'Rollback' }}
      </button>
    </aside>
  </section>
</template>
