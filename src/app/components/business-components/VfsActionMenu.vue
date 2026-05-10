<!--
  Row vs header geometry:
  - Header paths (`combined`, `global-create`) sit outside `ul.vfs-fm-list` overflow scrollports, so the menu
    panel can stay `position:absolute` under `details` without clipping or scrollmetric side-effects.
  - Row `entity-actions` shares list scroll ancestors; its panel is Teleported to `#st-vfs-action-menu-teleport`
    (fallback: `#st-vfs-popup-app`, then `document.body`) and positioned with `fixed` coords from
    `getBoundingClientRect(summary)` — overlay-right-bottom: right edges align via `translateX(-100%)`,
    vertical gap below the toggle (`FR-1`/`FR-2`).

  Invariants:
  - Single-open inside the popup: `closePeerMenus` closes peer `details.vfs-action-menu[open]`.
  - Outside dismiss uses `document` capture `click` plus one `AbortController`; listeners attach synchronously on
    open (no deferral used only to stage dismiss). Row panels outside `details` count as “inside” for dismiss.
-->
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
const panelRef = ref<HTMLUListElement | null>(null)
/** Pixel gap between toggle bottom edge and panel top (matches prior absolute `top: calc(100% + 8px)`). */
const ROW_PANEL_GAP_PX = 8

const panelFixedStyle = ref<Record<string, string>>({})

/** AbortController removes capture-phase listeners when the menu closes or unmounts. */
let menuInteractionAbort: AbortController | null = null

const entityActions = computed(() => getVisibleActions(props.entity))
const globalCreateActions: VfsGlobalAction[] = ['create-directory', 'create-file']

const globalActions = computed(() => (props.mode === 'entity-actions' ? [] : globalCreateActions))
const actions = computed(() => (props.mode === 'global-create' ? [] : entityActions.value))

const isEntityActions = computed(() => props.mode === 'entity-actions')

const teleportTarget = computed((): string => {
  if (typeof document === 'undefined') return 'body'
  if (document.querySelector('#st-vfs-action-menu-teleport')) return '#st-vfs-action-menu-teleport'
  if (document.querySelector('#st-vfs-popup-app')) return '#st-vfs-popup-app'
  return 'body'
})

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

function getPopupScopeRoot(details: HTMLElement): HTMLElement | null {
  return (
    details.closest('#st-vfs-popup') ??
    details.closest('.st-vfs-popup__app') ??
    details.closest('.vfs-tab-shell') ??
    details.closest('.vfs-file-manager-panel') ??
    details.parentElement ??
    null
  )
}

function closePeerMenus(details: HTMLDetailsElement): void {
  // Intent: enforce "one menu open" within the VFS popup only (never touch host page details).
  const scopeRoot = getPopupScopeRoot(details)
  scopeRoot?.querySelectorAll<HTMLDetailsElement>('details.vfs-action-menu[open]').forEach((peer) => {
    if (peer === details) return
    peer.removeAttribute('open')
  })
}

function onToggleClick(event: MouseEvent): void {
  emits('toggleClicked', event)
  if (isDisabled.value) {
    event.preventDefault()
    return
  }
  const details = detailsRef.value
  if (!details) return
  // WHY: keep `details/summary` semantics, but drive open/close explicitly to avoid toggle races and support
  // outside-dismiss + "clicking toggle while open doesn't have to close".
  event.preventDefault()
  closePeerMenus(details)
  details.setAttribute('open', '')
  // WHY: jsdom / some hosts omit `toggle` for programmatic `open`; always sync here.
  syncMenuLifecycle(details)
}

function teardownMenuInteraction(): void {
  menuInteractionAbort?.abort()
  menuInteractionAbort = null
  panelFixedStyle.value = {}
}

function updateFixedPanelPosition(): void {
  if (!isEntityActions.value || !detailsRef.value?.open) return
  const toggle = toggleRef.value
  // WHY: coords come from the trigger only. `panelRef` may be null on the first frame after Teleport
  // commits; gating on it left `panelFixedStyle` empty so scoped `position:absolute` + `top/right:unset`
  // pinned the panel to the top-left of `#st-vfs-action-menu-teleport`.
  if (!toggle) return
  const r = toggle.getBoundingClientRect()
  panelFixedStyle.value = {
    position: 'fixed',
    top: `${Math.round(r.bottom + ROW_PANEL_GAP_PX)}px`,
    left: `${Math.round(r.right)}px`,
    transform: 'translateX(-100%)',
    zIndex: '90',
  }
}

function attachScrollContainerReposition(handler: () => void, signal: AbortSignal): void {
  const toggle = toggleRef.value
  if (!toggle) return
  for (let cur: HTMLElement | null = toggle; cur; cur = cur.parentElement) {
    const { overflowY, overflowX } = window.getComputedStyle(cur)
    if (
      overflowY === 'auto' ||
      overflowY === 'scroll' ||
      overflowX === 'auto' ||
      overflowX === 'scroll'
    ) {
      cur.addEventListener('scroll', handler, { capture: true, signal })
    }
  }
}

function syncMenuLifecycle(details: HTMLDetailsElement): void {
  teardownMenuInteraction()
  if (!details.open) return
  closePeerMenus(details)

  const controller = new AbortController()
  menuInteractionAbort = controller
  const { signal } = controller

  const outsideDismiss = (clickEvent: MouseEvent): void => {
    if (!detailsRef.value?.open) return
    const target = clickEvent.target as Node | null
    if (!target) return
    if (details.contains(target)) return
    if (isEntityActions.value && panelRef.value?.contains(target)) return
    details.removeAttribute('open')
    teardownMenuInteraction()
  }

  document.addEventListener('click', outsideDismiss, { capture: true, signal })

  if (isEntityActions.value) {
    const reposition = (): void => {
      updateFixedPanelPosition()
    }
    window.addEventListener('resize', reposition, { signal })
    attachScrollContainerReposition(reposition, signal)
    reposition()
    void nextTick(() => {
      reposition()
      requestAnimationFrame(() => reposition())
    })
  }
}

function onOpenStateChanged(event: Event): void {
  const details = event.currentTarget as HTMLDetailsElement | null
  if (!details) return
  syncMenuLifecycle(details)
}

function triggerAction(action: VfsEntityAction): void {
  // WHY: keep runtime checks as source of truth; render filtering alone can be bypassed by stale state.
  if (!isActionTriggerable(props.entity, action)) return
  emits('actionSelected', action)
  detailsRef.value?.removeAttribute('open')
  teardownMenuInteraction()
}

function triggerGlobalAction(action: VfsGlobalAction): void {
  emits('globalActionSelected', action)
  detailsRef.value?.removeAttribute('open')
  teardownMenuInteraction()
}

onBeforeUnmount(() => {
  teardownMenuInteraction()
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
    <Teleport :to="teleportTarget" :disabled="!isEntityActions">
      <ul
        ref="panelRef"
        class="vfs-action-menu__list"
        :class="{ 'vfs-action-menu__list--entity-fixed': isEntityActions }"
        :data-testid="isEntityActions ? 'vfs-entity-action-menu-panel' : undefined"
        role="menu"
        :style="isEntityActions ? panelFixedStyle : undefined"
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
    </Teleport>
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
  /* Intent: render as an overlay so opening it doesn't change dialog layout/scroll (non-row modes stay absolute). */
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

.vfs-action-menu__list--entity-fixed {
  /* Viewport-anchored overlay: override base `position:absolute` so an empty `panelFixedStyle` cannot
     fall back to the teleport host's (0,0) absolute box. Top/left/transform/z-index from inline style. */
  position: fixed;
  top: unset;
  right: unset;
}

.vfs-action-menu__separator {
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  margin: 6px 0;
}
</style>
