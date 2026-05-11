<script setup lang="ts">
import { computed, ref } from 'vue'
import LineNumberGutter from '@/app/components/pure-components/LineNumberGutter.vue'
import type { VfsCommitHistoryRecord } from '@/app/composables/components-composables/useVfsCommitHistory'
import ReaderScreen from '@/app/screens/pure-screens/ReaderScreen.vue'

const model = defineModel<string>({ required: true })
const previewMode = defineModel<boolean>('previewMode', { default: false })
const props = withDefaults(
  defineProps<{
    historyRecords?: VfsCommitHistoryRecord[]
    saveInProgress?: boolean
    rollbackInProgress?: boolean
    showHistoryControls?: boolean
    /** When false, preview/save live in the parent preview chrome (e.g. VfsMainScreen top bar). */
    embedToolbar?: boolean
  }>(),
  {
    historyRecords: () => [],
    saveInProgress: false,
    rollbackInProgress: false,
    showHistoryControls: true,
    embedToolbar: true,
  },
)
const emits = defineEmits<{
  manualRollbackRequested: [payload: { sourceVersionId: string }]
  saveRequested: []
}>()
const rollbackSourceVersionId = ref<string | null>(null)
const editorScrollTop = ref(0)
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
const lineCount = computed(() => Math.max(1, model.value.split('\n').length))

function handleEditorScroll(event: Event): void {
  const target = event.target as HTMLTextAreaElement | null
  editorScrollTop.value = target?.scrollTop ?? 0
}

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
    <header v-if="props.embedToolbar" class="vfs-editor-toolbar">
      <button
        type="button"
        class="menu_button vfs-editor-toolbar__icon-button"
        :title="previewMode ? '查看源码' : '预览渲染'"
        :aria-label="previewMode ? '查看源码' : '预览渲染'"
        @click="previewMode = !previewMode"
      >
        <i
          :class="previewMode ? 'fa-solid fa-code' : 'fa-solid fa-eye'"
          aria-hidden="true"
        />
      </button>
      <button
        data-testid="editor-save-submit"
        type="button"
        class="menu_button vfs-editor-toolbar__icon-button"
        :title="props.saveInProgress ? '保存中' : '保存'"
        :aria-label="props.saveInProgress ? '保存中' : '保存'"
        :disabled="props.saveInProgress"
        :aria-busy="props.saveInProgress ? 'true' : undefined"
        @click="requestSave"
      >
        <i
          v-if="props.saveInProgress"
          class="fa-solid fa-spinner fa-spin"
          aria-hidden="true"
        />
        <i v-else class="fa-solid fa-floppy-disk" aria-hidden="true" />
      </button>
    </header>
    <div v-if="!previewMode" class="vfs-line-numbered-editor">
      <LineNumberGutter :line-count="lineCount" :scroll-top="editorScrollTop" />
      <textarea v-model="model" class="vfs-editor" @scroll="handleEditorScroll"></textarea>
    </div>
    <div v-else class="vfs-editor-preview-pane">
      <ReaderScreen :html="model" />
    </div>
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

<style scoped>
.vfs-editor-screen {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  height: 100%;
  max-height: 100%;
  min-height: 0;
  min-width: 0;
}

.vfs-editor-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

.vfs-editor-toolbar__icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2.25rem;
  min-height: 2.25rem;
  padding: 6px 10px;
}

.vfs-line-numbered-editor {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

.vfs-editor {
  flex: 1 1 auto;
  height: 100%;
  max-height: 100%;
  min-height: 0;
  width: 100%;
  box-sizing: border-box;
  overflow: auto;
  resize: none;
  /* WHY: preview shell already provides the visual frame; keep editor source area visually single-framed. */
  border: 0 !important;
  border-radius: 0;
  outline: none;
  box-shadow: none !important;
  background: transparent !important;
}

.vfs-editor-preview-pane {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}
</style>
