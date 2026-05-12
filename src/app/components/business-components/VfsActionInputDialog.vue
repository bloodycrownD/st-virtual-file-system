<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import VfsListboxField from '@/app/components/pure-components/VfsListboxField.vue'

type VfsActionInputField = {
  key: string
  label: string
  value: string
  type?: 'text' | 'select' | 'range-number'
  options?: Array<{ label: string; value: string }>
  min?: number
  max?: number
  step?: number
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
const firstInputRef = ref<{ focus: () => void } | HTMLInputElement | HTMLButtonElement | null>(null)
const rootRef = ref<HTMLElement | null>(null)
const openSelectKey = ref<string | null>(null)

const normalizedFields = computed(() => props.fields ?? [])

function setFirstInputRef(el: unknown, idx: number): void {
  if (idx !== 0) return
  if (!el) {
    firstInputRef.value = null
    return
  }
  if (typeof el === 'object' && el !== null && 'focus' in el && typeof (el as { focus: unknown }).focus === 'function') {
    firstInputRef.value = el as { focus: () => void }
    return
  }
  firstInputRef.value = (el as HTMLInputElement | HTMLButtonElement | null) ?? null
}

function normalizeNumericValue(raw: string, min: number, max: number): string {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return String(min)
  return String(Math.min(max, Math.max(min, parsed)))
}

function onRangeNumberInput(field: VfsActionInputField, raw: string): void {
  const min = Number.isFinite(field.min) ? Number(field.min) : 0
  const max = Number.isFinite(field.max) ? Number(field.max) : 1000
  localValues.value[field.key] = normalizeNumericValue(raw, min, max)
}

function getOptions(field: VfsActionInputField): Array<{ label: string; value: string }> {
  return field.options ?? []
}

function onClickOutside(event: MouseEvent): void {
  if (!openSelectKey.value) return
  const root = rootRef.value
  if (!root) return
  const target = event.target
  if (target instanceof Node && root.contains(target)) return
  openSelectKey.value = null
}

watch(
  () => [props.open, props.fields] as const,
  async ([open]) => {
    if (!open) {
      localValues.value = {}
      openSelectKey.value = null
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
  if (event.key === 'Escape' && openSelectKey.value) {
    event.preventDefault()
    openSelectKey.value = null
    return
  }
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

onMounted(() => {
  document.addEventListener('mousedown', onClickOutside, true)
})

onUnmounted(() => {
  document.removeEventListener('mousedown', onClickOutside, true)
})
</script>

<template>
  <div
    v-if="open"
    ref="rootRef"
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
            v-if="(field.type ?? 'text') === 'text'"
            :ref="(el) => setFirstInputRef(el, idx)"
            v-model="localValues[field.key]"
            class="text_pole"
            type="text"
            autocomplete="off"
            :placeholder="field.placeholder"
            :data-testid="`vfs-action-input-${field.key}`"
          />
          <VfsListboxField
            v-else-if="field.type === 'select'"
            :ref="(el) => setFirstInputRef(el, idx)"
            v-model="localValues[field.key]"
            class="vfs-action-input-dialog__listbox-field"
            :options="getOptions(field)"
            :placeholder="field.placeholder ?? ''"
            :ariaLabel="field.label"
            :data-testid="`vfs-action-input-${field.key}`"
            :open="openSelectKey === field.key"
            @update:open="
              (v) => {
                if (v) openSelectKey = field.key
                else if (openSelectKey === field.key) openSelectKey = null
              }
            "
          />
          <div v-else class="vfs-action-input-dialog__range-number">
            <input
              :ref="(el) => setFirstInputRef(el, idx)"
              :value="localValues[field.key]"
              type="range"
              :min="field.min ?? 0"
              :max="field.max ?? 1000"
              :step="field.step ?? 1"
              :data-testid="`vfs-action-input-${field.key}-range`"
              @input="onRangeNumberInput(field, ($event.target as HTMLInputElement).value)"
            />
            <input
              class="text_pole"
              :value="localValues[field.key]"
              type="number"
              :min="field.min ?? 0"
              :max="field.max ?? 1000"
              :step="field.step ?? 1"
              :data-testid="`vfs-action-input-${field.key}`"
              @input="onRangeNumberInput(field, ($event.target as HTMLInputElement).value)"
            />
          </div>
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

.vfs-action-input-dialog__range-number {
  display: grid;
  grid-template-columns: 1fr 92px;
  gap: 8px;
  align-items: center;
}

.vfs-action-input-dialog__listbox-field {
  width: 100%;
}
</style>
