<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    title?: string
    message: string
    confirmText?: string
    cancelText?: string
  }>(),
  {
    title: '请确认操作',
    confirmText: '确定',
    cancelText: '取消',
  },
)

const emits = defineEmits<{
  confirm: []
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
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    emits('confirm')
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
    :aria-label="title"
    data-testid="vfs-action-confirm-dialog"
    @keydown="handleKeydown"
  >
    <div class="vfs-create-modal__card">
      <h3 class="vfs-create-modal__title">{{ title }}</h3>
      <p class="vfs-action-confirm-dialog__message">{{ message }}</p>
      <div class="vfs-create-modal__actions">
        <button type="button" class="menu_button" data-testid="vfs-action-confirm-submit" @click="emits('confirm')">
          {{ confirmText }}
        </button>
        <button type="button" class="menu_button" data-testid="vfs-action-confirm-cancel" @click="emits('cancel')">
          {{ cancelText }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.vfs-action-confirm-dialog__message {
  margin: 0;
  color: var(--SmartThemeBodyColor, rgba(255, 255, 255, 0.85));
  line-height: 1.45;
}
</style>
