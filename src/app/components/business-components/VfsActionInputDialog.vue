<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

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
const firstInputRef = ref<HTMLInputElement | HTMLButtonElement | null>(null)
const rootRef = ref<HTMLElement | null>(null)
const openSelectKey = ref<string | null>(null)
const activeOptionIndexByKey = ref<Record<string, number>>({})

const normalizedFields = computed(() => props.fields ?? [])

function setFirstInputRef(el: unknown, idx: number): void {
  if (idx !== 0) return
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

function getSelectedOptionLabel(field: VfsActionInputField): string {
  const value = localValues.value[field.key] ?? ''
  const selected = getOptions(field).find((opt) => opt.value === value)
  return selected?.label ?? ''
}

function getSelectedIndex(field: VfsActionInputField): number {
  const value = localValues.value[field.key] ?? ''
  return getOptions(field).findIndex((opt) => opt.value === value)
}

function ensureActiveIndexInitialized(field: VfsActionInputField): void {
  const options = getOptions(field)
  if (options.length === 0) {
    activeOptionIndexByKey.value[field.key] = -1
    return
  }
  const selectedIndex = getSelectedIndex(field)
  activeOptionIndexByKey.value[field.key] = selectedIndex >= 0 ? selectedIndex : 0
}

function closeOpenListbox(): void {
  openSelectKey.value = null
}

function openListbox(field: VfsActionInputField): void {
  openSelectKey.value = field.key
  ensureActiveIndexInitialized(field)
}

function toggleListbox(field: VfsActionInputField): void {
  if (openSelectKey.value === field.key) {
    closeOpenListbox()
    return
  }
  openListbox(field)
}

function selectOption(field: VfsActionInputField, value: string): void {
  localValues.value[field.key] = value
  closeOpenListbox()
}

function moveActiveOption(field: VfsActionInputField, delta: 1 | -1): void {
  const options = getOptions(field)
  if (options.length === 0) return
  const current = activeOptionIndexByKey.value[field.key] ?? getSelectedIndex(field)
  if (current < 0) {
    activeOptionIndexByKey.value[field.key] = 0
    return
  }
  // WHY: keep keyboard navigation bounded so Arrow keys never escape valid option range.
  const next = Math.max(0, Math.min(options.length - 1, current + delta))
  activeOptionIndexByKey.value[field.key] = next
}

function commitActiveOption(field: VfsActionInputField): void {
  const options = getOptions(field)
  const idx = activeOptionIndexByKey.value[field.key] ?? -1
  if (!options[idx]) return
  selectOption(field, options[idx].value)
}

function onSelectTriggerKeydown(event: KeyboardEvent, field: VfsActionInputField): void {
  switch (event.key) {
    case 'ArrowDown': {
      event.preventDefault()
      if (openSelectKey.value !== field.key) {
        openListbox(field)
        return
      }
      moveActiveOption(field, 1)
      return
    }
    case 'ArrowUp': {
      event.preventDefault()
      if (openSelectKey.value !== field.key) {
        openListbox(field)
        return
      }
      moveActiveOption(field, -1)
      return
    }
    case 'Enter': {
      event.preventDefault()
      if (openSelectKey.value !== field.key) {
        openListbox(field)
        return
      }
      commitActiveOption(field)
      return
    }
    case 'Escape': {
      if (openSelectKey.value === field.key) {
        event.preventDefault()
        closeOpenListbox()
      }
      return
    }
    case 'Tab': {
      // WHY: Tab should preserve native focus flow; only collapse popup before focus leaves trigger.
      closeOpenListbox()
      return
    }
  }
}

function onClickOutside(event: MouseEvent): void {
  if (!openSelectKey.value) return
  const root = rootRef.value
  if (!root) return
  const target = event.target
  if (target instanceof Node && root.contains(target)) return
  closeOpenListbox()
}

watch(
  () => [props.open, props.fields] as const,
  async ([open]) => {
    if (!open) {
      localValues.value = {}
      openSelectKey.value = null
      activeOptionIndexByKey.value = {}
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
    closeOpenListbox()
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
          <div
            v-else-if="field.type === 'select'"
          >
            <button
              :id="`vfs-action-input-${field.key}`"
              :ref="(el) => setFirstInputRef(el, idx)"
              type="button"
              class="vfs-action-input-dialog__listbox-trigger"
              role="combobox"
              aria-haspopup="listbox"
              :aria-expanded="openSelectKey === field.key ? 'true' : 'false'"
              :aria-controls="`vfs-action-input-listbox-${field.key}`"
              :aria-activedescendant="
                openSelectKey === field.key && activeOptionIndexByKey[field.key] >= 0
                  ? `vfs-action-input-option-${field.key}-${activeOptionIndexByKey[field.key]}`
                  : undefined
              "
              :data-testid="`vfs-action-input-${field.key}`"
              @click="toggleListbox(field)"
              @keydown="onSelectTriggerKeydown($event, field)"
            >
              <span>{{ getSelectedOptionLabel(field) }}</span>
              <i class="fa-solid fa-chevron-down" aria-hidden="true" />
            </button>
            <ul
              v-if="openSelectKey === field.key"
              :id="`vfs-action-input-listbox-${field.key}`"
              class="vfs-action-input-dialog__listbox-popup"
              role="listbox"
              :aria-labelledby="`vfs-action-input-${field.key}`"
              :data-testid="`vfs-action-input-${field.key}-listbox`"
            >
              <li v-for="(opt, optIdx) in getOptions(field)" :key="`${field.key}-${opt.value}`" role="presentation">
                <button
                  :id="`vfs-action-input-option-${field.key}-${optIdx}`"
                  type="button"
                  class="vfs-action-input-dialog__listbox-option"
                  role="option"
                  :aria-selected="localValues[field.key] === opt.value ? 'true' : 'false'"
                  :data-active="activeOptionIndexByKey[field.key] === optIdx ? 'true' : 'false'"
                  @mouseenter="activeOptionIndexByKey[field.key] = optIdx"
                  @click="selectOption(field, opt.value)"
                >
                  {{ opt.label }}
                </button>
              </li>
            </ul>
          </div>
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

.vfs-action-input-dialog__listbox-trigger {
  width: 100%;
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(15, 18, 24, 0.92);
  color: inherit;
  text-align: left;
  line-height: 1.35;
  font-size: 1rem;
  cursor: pointer;
}

.vfs-action-input-dialog__listbox-trigger:focus-visible {
  outline-offset: 1px;
}

.vfs-action-input-dialog__listbox-popup {
  margin: 6px 0 0;
  padding: 4px;
  list-style: none;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(20, 24, 32, 0.98);
  max-height: 220px;
  overflow: auto;
}

.vfs-action-input-dialog__listbox-option {
  width: 100%;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  text-align: left;
  padding: 8px 10px;
  font-size: 1rem;
  line-height: 1.35;
  cursor: pointer;
}

.vfs-action-input-dialog__listbox-option[data-active='true'] {
  background: rgba(255, 255, 255, 0.14);
}

.vfs-action-input-dialog__listbox-option[aria-selected='true'] {
  font-weight: 600;
}
</style>
