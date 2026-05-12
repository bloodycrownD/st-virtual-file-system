<script setup lang="ts">
import { computed, ref } from 'vue'
import LineNumberGutter from '@/app/components/pure-components/LineNumberGutter.vue'
import ReaderScreen from '@/app/screens/pure-screens/ReaderScreen.vue'

const model = defineModel<string>({ required: true })
const previewMode = defineModel<boolean>('previewMode', { default: false })
const props = withDefaults(
  defineProps<{
    saveInProgress?: boolean
    /** When false, preview/save live in the parent preview chrome (e.g. VfsMainScreen top bar). */
    embedToolbar?: boolean
  }>(),
  {
    saveInProgress: false,
    embedToolbar: true,
  },
)
const emits = defineEmits<{
  saveRequested: []
}>()
const editorScrollTop = ref(0)
const lineCount = computed(() => Math.max(1, model.value.split('\n').length))

function handleEditorScroll(event: Event): void {
  const target = event.target as HTMLTextAreaElement | null
  editorScrollTop.value = target?.scrollTop ?? 0
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
    <!-- WHY: line numbers map to logical source lines; rendered preview layout does not match those lines. -->
    <div v-if="!previewMode" class="vfs-line-numbered-editor">
      <LineNumberGutter :line-count="lineCount" :scroll-top="editorScrollTop" />
      <textarea v-model="model" class="vfs-editor" @scroll="handleEditorScroll"></textarea>
    </div>
    <div v-else class="vfs-editor-preview-pane">
      <ReaderScreen :html="model" />
    </div>
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
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  overflow: auto;
}
</style>
