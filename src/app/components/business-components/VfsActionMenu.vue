<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import {
  getVisibleActions,
  isActionTriggerable,
  type VfsEntityAction,
  type VfsGlobalAction,
  type VfsManagerEntity,
} from '@/app/composables/components-composables/useVfsFileManagerModel'

type VfsActionMenuMode = 'combined' | 'global-create' | 'entity-actions'

const props = withDefaults(
  defineProps<{
    entity: VfsManagerEntity | null
    mode?: VfsActionMenuMode
  }>(),
  {
    mode: 'combined',
  },
)
const emits = defineEmits<{
  actionSelected: [action: VfsEntityAction]
  globalActionSelected: [action: VfsGlobalAction]
  toggleClicked: [event: MouseEvent]
}>()

const detailsRef = ref<HTMLDetailsElement | null>(null)
const toggleRef = ref<HTMLElement | null>(null)
const overlayInlineStyle = ref<Record<string, string>>({})
let syncPositionWithViewport: (() => void) | null = null

const entityActions = computed(() => getVisibleActions(props.entity))
const globalCreateActions: VfsGlobalAction[] = ['create-directory', 'create-file']

const globalActions = computed(() => (props.mode === 'entity-actions' ? [] : globalCreateActions))
const actions = computed(() => (props.mode === 'global-create' ? [] : entityActions.value))
const isEntityActionsMenu = computed(() => props.mode === 'entity-actions')

// WHY: "more actions" must stay usable even without selection so users can trigger create actions globally.
const isDisabled = computed(() => globalActions.value.length === 0 && actions.value.length === 0)
const disabledHint = computed(() => (isDisabled.value ? '当前没有可执行操作' : ''))
const toggleLabel = '更多操作'
const toggleTitle = computed(() => (disabledHint.value ? `${toggleLabel}（${disabledHint.value}）` : toggleLabel))
// Intent: keep icon choices in one place so toolbar controls share a predictable visual language.
const ACTION_MENU_ICON = 'fa-solid fa-ellipsis'
const ACTION_LABELS: Record<VfsEntityAction, string> = {
  'toggle-status': '切换状态',
  delete: '删除',
  view: '查看',
  edit: '编辑',
  rename: '重命名',
  'apply-strategy': '展示策略',
  'open-slideshow': '幻灯片/阅读模式',
}
const GLOBAL_ACTION_LABELS: Record<VfsGlobalAction, string> = {
  'create-directory': '新建目录',
  'create-file': '新建文件',
}

function onToggleClick(event: MouseEvent): void {
  emits('toggleClicked', event)
  if (!isDisabled.value) return
  event.preventDefault()
}

function teardownViewportSync(): void {
  if (!syncPositionWithViewport) return
  window.removeEventListener('resize', syncPositionWithViewport)
  window.removeEventListener('scroll', syncPositionWithViewport, true)
  syncPositionWithViewport = null
}

function updateEntityMenuAnchor(): void {
  if (!isEntityActionsMenu.value) return
  const toggle = toggleRef.value
  if (!toggle) return
  const rect = toggle.getBoundingClientRect()
  overlayInlineStyle.value = {
    // Intent: keep row menu anchored to the clicked button and detached from parent scroll containers.
    '--vfs-menu-anchor-top': `${rect.bottom + 8}px`,
    '--vfs-menu-anchor-right': `${rect.right}px`,
    position: 'fixed',
  }
}

async function onOpenStateChanged(event: Event): Promise<void> {
  const details = event.currentTarget as HTMLDetailsElement | null
  if (!details || !isEntityActionsMenu.value) return
  teardownViewportSync()
  if (!details.open) return
  await nextTick()
  updateEntityMenuAnchor()
  const reposition = () => {
    if (!detailsRef.value?.open) return
    updateEntityMenuAnchor()
  }
  syncPositionWithViewport = reposition
  window.addEventListener('resize', reposition)
  window.addEventListener('scroll', reposition, true)
}

function triggerAction(action: VfsEntityAction): void {
  // WHY: keep runtime checks as source of truth; render filtering alone can be bypassed by stale state.
  if (!isActionTriggerable(props.entity, action)) return
  emits('actionSelected', action)
  detailsRef.value?.removeAttribute('open')
}

function triggerGlobalAction(action: VfsGlobalAction): void {
  emits('globalActionSelected', action)
  detailsRef.value?.removeAttribute('open')
}

onBeforeUnmount(() => {
  teardownViewportSync()
})
</script>

<template>
  <details
    ref="detailsRef"
    class="vfs-action-menu"
    :data-disabled="isDisabled ? 'true' : 'false'"
    @toggle="onOpenStateChanged"
  >
    <summary
      ref="toggleRef"
      class="vfs-action-menu__toggle"
      data-testid="vfs-action-menu-toggle"
      :aria-disabled="isDisabled"
      :aria-label="toggleLabel"
      :title="toggleTitle"
      @click="onToggleClick"
    >
      <i :class="ACTION_MENU_ICON" aria-hidden="true"></i>
    </summary>
    <ul
      class="vfs-action-menu__list"
      :class="{ 'vfs-action-menu__list--entity-overlay': isEntityActionsMenu }"
      :style="isEntityActionsMenu ? overlayInlineStyle : undefined"
      role="menu"
    >
      <li v-for="action in globalActions" :key="action" role="none">
        <button
          type="button"
          class="menu_button"
          role="menuitem"
          :data-action="action"
          @click="triggerGlobalAction(action)"
        >
          {{ GLOBAL_ACTION_LABELS[action] }}
        </button>
      </li>
      <li
        v-if="globalActions.length > 0 && actions.length > 0"
        class="vfs-action-menu__separator"
        role="separator"
        aria-hidden="true"
      ></li>
      <li v-for="action in actions" :key="action" role="none">
        <button
          type="button"
          class="menu_button"
          role="menuitem"
          :data-action="action"
          @click="triggerAction(action)"
        >
          {{ ACTION_LABELS[action] }}
        </button>
      </li>
    </ul>
  </details>
</template>

<style scoped>
.vfs-action-menu {
  position: relative;
}

.vfs-action-menu__toggle {
  cursor: pointer;
  user-select: none;
  list-style: none;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.vfs-action-menu__toggle i {
  font-size: 14px;
  line-height: 1;
}

.vfs-action-menu[data-disabled='true'] .vfs-action-menu__toggle {
  opacity: 0.5;
  cursor: not-allowed;
}

.vfs-action-menu__list {
  /* Intent: render as an overlay so opening it doesn't change dialog layout/scroll. */
  margin: 0;
  padding: 8px;
  list-style: none;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.25);
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 180px;
  z-index: 50;
  max-height: min(50vh, 360px);
  overflow: auto;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.45);
}

.vfs-action-menu__list--entity-overlay {
  /* Intent: row menu must stay overlay-right-bottom, never auto-flip with container constraints. */
  top: var(--vfs-menu-anchor-top);
  left: var(--vfs-menu-anchor-right);
  right: auto;
  transform: translateX(-100%);
}

.vfs-action-menu__separator {
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  margin: 6px 0;
}
</style>
