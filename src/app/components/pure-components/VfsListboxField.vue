<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: string
    options: Array<{ label: string; value: string }>
    placeholder?: string
    disabled?: boolean
    ariaLabel: string
    dataTestid?: string
    /** When set, listbox visibility is controlled by the parent (e.g. mutual exclusion across fields). */
    open?: boolean
  }>(),
  {
    placeholder: '',
    disabled: false,
    dataTestid: undefined,
    open: undefined,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:open': [open: boolean]
}>()

const rootRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLButtonElement | null>(null)
const internalOpen = ref(false)
const activeOptionIndex = ref(0)

const uid = `vfs-lb-${Math.random().toString(36).slice(2, 10)}`
const triggerId = computed(() => (props.dataTestid ? `${props.dataTestid}-trigger` : `${uid}-trigger`))
const listboxId = computed(() => (props.dataTestid ? `${props.dataTestid}-listbox` : `${uid}-listbox`))

const isControlledOpen = computed(() => typeof props.open === 'boolean')
const isExpanded = computed(() => (isControlledOpen.value ? Boolean(props.open) : internalOpen.value))

function setOpen(next: boolean): void {
  if (isControlledOpen.value) {
    emit('update:open', next)
    return
  }
  internalOpen.value = next
}

function getSelectedIndex(): number {
  return props.options.findIndex((opt) => opt.value === props.modelValue)
}

const displayLabel = computed(() => {
  const selected = props.options.find((opt) => opt.value === props.modelValue)
  if (selected) return selected.label
  return props.placeholder || ''
})

function ensureActiveIndexInitialized(): void {
  const options = props.options
  if (options.length === 0) {
    activeOptionIndex.value = -1
    return
  }
  const selectedIndex = getSelectedIndex()
  activeOptionIndex.value = selectedIndex >= 0 ? selectedIndex : 0
}

watch(
  () => props.options,
  () => {
    ensureActiveIndexInitialized()
  },
  { deep: true },
)

watch(
  () => props.modelValue,
  () => {
    if (isExpanded.value) ensureActiveIndexInitialized()
  },
)

function closeListbox(): void {
  setOpen(false)
}

function openListbox(): void {
  setOpen(true)
  ensureActiveIndexInitialized()
}

function toggleListbox(): void {
  if (props.disabled) return
  if (isExpanded.value) closeListbox()
  else openListbox()
}

function selectValue(value: string): void {
  emit('update:modelValue', value)
  closeListbox()
}

function moveActive(delta: 1 | -1): void {
  const options = props.options
  if (options.length === 0) return
  const current = activeOptionIndex.value
  if (current < 0) {
    activeOptionIndex.value = 0
    return
  }
  // WHY: keep keyboard navigation bounded so Arrow keys never escape valid option range.
  const next = Math.max(0, Math.min(options.length - 1, current + delta))
  activeOptionIndex.value = next
}

function commitActive(): void {
  const options = props.options
  const idx = activeOptionIndex.value
  if (!options[idx]) return
  selectValue(options[idx].value)
}

function onTriggerKeydown(event: KeyboardEvent): void {
  if (props.disabled) return
  switch (event.key) {
    case 'ArrowDown': {
      event.preventDefault()
      if (!isExpanded.value) {
        openListbox()
        return
      }
      moveActive(1)
      return
    }
    case 'ArrowUp': {
      event.preventDefault()
      if (!isExpanded.value) {
        openListbox()
        return
      }
      moveActive(-1)
      return
    }
    case 'Enter': {
      event.preventDefault()
      if (!isExpanded.value) {
        openListbox()
        return
      }
      commitActive()
      return
    }
    case 'Escape': {
      if (isExpanded.value) {
        event.preventDefault()
        event.stopPropagation()
        closeListbox()
      }
      return
    }
    case 'Tab': {
      // WHY: Tab should preserve native focus flow; only collapse popup before focus leaves trigger.
      closeListbox()
      return
    }
  }
}

function onClickOutside(event: MouseEvent): void {
  if (!isExpanded.value) return
  const root = rootRef.value
  if (!root) return
  const target = event.target
  if (target instanceof Node && root.contains(target)) return
  closeListbox()
}

onMounted(() => {
  document.addEventListener('mousedown', onClickOutside, true)
})

onUnmounted(() => {
  document.removeEventListener('mousedown', onClickOutside, true)
})

function focus(): void {
  triggerRef.value?.focus()
}

defineExpose({ focus })
</script>

<template>
  <div ref="rootRef" class="vfs-listbox-field">
    <button
      :id="triggerId"
      ref="triggerRef"
      type="button"
      class="vfs-listbox-field__trigger"
      role="combobox"
      :aria-label="ariaLabel"
      aria-haspopup="listbox"
      :aria-expanded="isExpanded ? 'true' : 'false'"
      :aria-controls="listboxId"
      :aria-activedescendant="
        isExpanded && activeOptionIndex >= 0 ? `${listboxId}-opt-${activeOptionIndex}` : undefined
      "
      :disabled="disabled"
      :data-testid="dataTestid"
      @click="toggleListbox"
      @keydown="onTriggerKeydown"
    >
      <span class="vfs-listbox-field__trigger-label">{{ displayLabel }}</span>
      <i class="fa-solid fa-chevron-down" aria-hidden="true" />
    </button>
    <ul
      v-if="isExpanded"
      :id="listboxId"
      class="vfs-listbox-field__listbox"
      role="listbox"
      :aria-labelledby="triggerId"
      :data-testid="dataTestid ? `${dataTestid}-listbox` : undefined"
      @mousedown.stop.prevent
      @click.stop
    >
      <li v-for="(opt, optIdx) in options" :key="`${opt.value}-${optIdx}`" role="presentation">
        <button
          :id="`${listboxId}-opt-${optIdx}`"
          type="button"
          class="vfs-listbox-field__option"
          role="option"
          :aria-selected="modelValue === opt.value ? 'true' : 'false'"
          :data-active="activeOptionIndex === optIdx ? 'true' : 'false'"
          @mouseenter="activeOptionIndex = optIdx"
          @mousedown.stop.prevent
          @click.stop.prevent="selectValue(opt.value)"
        >
          {{ opt.label }}
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.vfs-listbox-field {
  position: relative;
  min-width: 0;
}

.vfs-listbox-field__trigger {
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

.vfs-listbox-field__trigger:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.vfs-listbox-field__trigger:focus-visible {
  outline-offset: 1px;
}

.vfs-listbox-field__trigger-label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vfs-listbox-field__listbox {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  z-index: 20;
  margin: 0;
  padding: 4px;
  list-style: none;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(20, 24, 32, 0.98);
  max-height: 220px;
  overflow: auto;
}

.vfs-listbox-field__option {
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

.vfs-listbox-field__option[data-active='true'] {
  background: rgba(255, 255, 255, 0.14);
}

.vfs-listbox-field__option[aria-selected='true'] {
  font-weight: 600;
}
</style>
