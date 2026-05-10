<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

const props = defineProps<{
  open: boolean
}>()
const emits = defineEmits<{
  save: []
  discard: []
  cancel: []
}>()

const overlayRef = ref<HTMLElement | null>(null)

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    await nextTick()
    overlayRef.value?.focus()
  },
)

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    emits('cancel')
  }
}
</script>

<template>
  <div
    v-if="open"
    ref="overlayRef"
    class="vfs-create-modal__overlay"
    tabindex="-1"
    role="dialog"
    aria-modal="true"
    aria-label="未保存的更改"
    data-testid="vfs-unsaved-editor-dialog"
    @keydown="handleKeydown"
  >
    <div class="vfs-create-modal__card">
      <h3 class="vfs-create-modal__title">未保存的更改</h3>
      <p class="vfs-unsaved-editor-dialog__body">当前编辑内容尚未保存。请选择保存、放弃更改或取消。</p>
      <div class="vfs-create-modal__actions vfs-unsaved-editor-dialog__actions">
        <button type="button" class="menu_button" data-testid="vfs-unsaved-save" @click="emits('save')">保存</button>
        <button type="button" class="menu_button" data-testid="vfs-unsaved-discard" @click="emits('discard')">
          放弃更改
        </button>
        <button type="button" class="menu_button" data-testid="vfs-unsaved-cancel" @click="emits('cancel')">取消</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.vfs-unsaved-editor-dialog__body {
  margin: 0;
  color: var(--SmartThemeBodyColor, rgba(255, 255, 255, 0.85));
  font-size: 0.95rem;
  line-height: 1.45;
}
.vfs-unsaved-editor-dialog__actions {
  flex-wrap: wrap;
  justify-content: flex-end;
}
</style>
