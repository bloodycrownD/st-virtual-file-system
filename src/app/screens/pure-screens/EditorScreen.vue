<script setup lang="ts">
import { computed, ref } from 'vue'
import LineNumberGutter from '@/app/components/pure-components/LineNumberGutter.vue'
import ReaderScreen from '@/app/screens/pure-screens/ReaderScreen.vue'
import { useEditorLineHeightSync } from '@/app/composables/components-composables/useEditorLineHeightSync'

const model = defineModel<string>({ required: true })
const previewMode = defineModel<boolean>('previewMode', { default: false })
const props = withDefaults(
  defineProps<{
    filePath: string
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
const editorWrapRef = ref<HTMLElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const mirrorRef = ref<HTMLElement | null>(null)
const lineCount = computed(() => Math.max(1, model.value.split('\n').length))
const mirrorLines = computed(() => model.value.split('\n'))

const { visualRowHeightPx, visualRowLineHeight, visualRowCounts, contentPadding } = useEditorLineHeightSync(
  model,
  textareaRef,
  mirrorRef,
  editorWrapRef,
)

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
    <div v-if="!previewMode" class="vfs-line-numbered-editor">
      <LineNumberGutter
        :line-count="lineCount"
        :visual-row-height-px="visualRowHeightPx"
        :visual-row-line-height="visualRowLineHeight"
        :visual-row-counts="visualRowCounts"
        :content-padding="contentPadding"
        :scroll-top="editorScrollTop"
      />
      <div ref="editorWrapRef" class="vfs-editor-wrap">
        <!-- WHY: mirror content width = textarea text column; gutter rows match soft-wrapped visual lines. -->
        <div ref="mirrorRef" class="vfs-editor-line-mirror" aria-hidden="true">
          <div
            v-for="(line, index) in mirrorLines"
            :key="index"
            class="vfs-editor-line-mirror__line"
          >
            {{ line.length === 0 ? '\u00a0' : line }}
          </div>
        </div>
        <textarea ref="textareaRef" v-model="model" class="vfs-editor" @scroll="handleEditorScroll"></textarea>
      </div>
    </div>
    <div v-else class="vfs-editor-preview-pane">
      <ReaderScreen :html="model" :file-path="props.filePath" />
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

.vfs-editor-wrap {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

.vfs-editor-line-mirror {
  position: absolute;
  top: 0;
  left: 0;
  visibility: hidden;
  pointer-events: none;
  overflow: visible;
  box-sizing: content-box;
  padding: 0;
  margin: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.72;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.vfs-editor-line-mirror__line {
  display: block;
  width: 100%;
  min-width: 0;
}

.vfs-editor {
  position: relative;
  z-index: 1;
  flex: 1 1 auto;
  height: 100%;
  max-height: 100%;
  min-height: 0;
  width: 100%;
  box-sizing: border-box;
  overflow: auto;
  resize: none;
  padding: 8px 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.72;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
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
