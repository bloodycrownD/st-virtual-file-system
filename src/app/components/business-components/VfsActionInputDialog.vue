<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

type VfsActionInputField = {
  key: string
  label: string
  value: string
  placeholder?: string
}

const props = withDefaults(
  defineProps<{
    open: boolean
    title?: string
    fields: VfsActionInputField[]
    errorMessage?: string
    confirmText?: string
    cancelText?: string
  }>(),
  {
    title: '请输入',
    errorMessage: '',
    confirmText: '确定',
    cancelText: '取消',
  },
)

const emits = defineEmits<{
  confirm: [payload: Record<string, string>]
  cancel: []
}>()

const localValues = ref<Record<string, string>>({})
const firstInputRef = ref<HTMLInputElement | null>(null)

const normalizedFields = computed(() => props.fields ?? [])

function setFirstInputRef(el: unknown, idx: number): void {
  if (idx !== 0) return
  firstInputRef.value = (el as HTMLInputElement | null) ?? null
}

watch(
  () => [props.open, props.fields] as const,
  async ([open]) => {
    if (!open) {
      localValues.value = {}
      return
    }
    const next: Record<string, string> = {}
    for (const field of normalizedFields.value) next[field.key] = field.value ?? ''
    localValues.value = next
    await nextTick()
    firstInputRef.value?.focus()
  },
  { immediate: true },
)

function submit(): void {
  emits('confirm', { ...localValues.value })
}

function handleKeydown(event: KeyboardEvent): void {
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
    data-testid="vfs-action-input-dialog"
    @keydown="handleKeydown"
  >
    <div class="vfs-create-modal__card">
      <h3 class="vfs-create-modal__title">{{ title }}</h3>
      <div class="vfs-action-input-dialog__fields">
        <label v-for="(field, idx) in normalizedFields" :key="field.key" class="vfs-create-modal__field">
          <span>{{ field.label }}</span>
          <input
            :ref="(el) => setFirstInputRef(el, idx)"
            v-model="localValues[field.key]"
            class="text_pole"
            type="text"
            autocomplete="off"
            :placeholder="field.placeholder"
            :data-testid="`vfs-action-input-${field.key}`"
          />
        </label>
      </div>
      <p v-if="errorMessage" class="vfs-action-input-dialog__error">{{ errorMessage }}</p>
      <div class="vfs-create-modal__actions">
        <button type="button" class="menu_button" data-testid="vfs-action-input-submit" @click="submit">
          {{ confirmText }}
        </button>
        <button type="button" class="menu_button" data-testid="vfs-action-input-cancel" @click="emits('cancel')">
          {{ cancelText }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.vfs-action-input-dialog__fields {
  display: grid;
  gap: 8px;
}
.vfs-action-input-dialog__error {
  margin: 0;
  color: #ffb3b3;
  font-size: 0.9rem;
}
</style>
