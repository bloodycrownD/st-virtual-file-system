<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

const props = defineProps<{
  open: boolean
  kind: 'file' | 'directory'
}>()
const emits = defineEmits<{
  confirm: [name: string]
  cancel: []
}>()

const name = ref('')
const inputRef = ref<HTMLInputElement | null>(null)
const title = computed(() => (props.kind === 'directory' ? '新建目录' : '新建文件'))

watch(
  () => props.open,
  async (open) => {
    if (!open) {
      name.value = ''
      return
    }
    await nextTick()
    inputRef.value?.focus()
  },
  { immediate: true },
)

function submit(): void {
  emits('confirm', name.value.trim())
}

function handleKeydown(event: KeyboardEvent): void {
  // WHY: modal keyboard shortcuts mirror native dialog expectations while staying inside popup UI.
  if (event.key === 'Escape') {
    event.preventDefault()
    emits('cancel')
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    submit()
  }
}
</script>

<template>
  <div
    v-if="open"
    class="vfs-create-modal__overlay"
    role="dialog"
    aria-modal="true"
    :aria-label="title"
    @keydown="handleKeydown"
  >
    <div class="vfs-create-modal__card">
      <h3 class="vfs-create-modal__title">{{ title }}</h3>
      <label class="vfs-create-modal__field">
        <span>名称</span>
        <input ref="inputRef" v-model="name" class="text_pole" type="text" autocomplete="off" />
      </label>
      <div class="vfs-create-modal__actions">
        <button type="button" class="menu_button" @click="submit">确定</button>
        <button type="button" class="menu_button" @click="emits('cancel')">取消</button>
      </div>
    </div>
  </div>
</template>
