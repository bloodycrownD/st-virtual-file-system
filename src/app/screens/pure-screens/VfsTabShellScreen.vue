<script setup lang="ts">
import { computed, ref } from 'vue'

/** WHY: Server-side paginated logs (`VfsLogPanel`) are not a top-level tab — chat execution logs live under `history`. */
const ALL_TABS = ['files', 'history', 'worktree'] as const
type VfsTab = (typeof ALL_TABS)[number]
const activeTab = ref<VfsTab>('files')
const TAB_LABELS: Record<VfsTab, string> = {
  files: '文件管理',
  /** WHY: `history` slot renders chat execution logs + post-commit checkpoint rollback. */
  history: '执行与回滚',
  worktree: '工作树',
}
const props = defineProps<{
  tabs?: VfsTab[]
  beforeTabChange?: (nextTab: VfsTab) => boolean | Promise<boolean>
}>()
const emits = defineEmits<{
  tabChanged: [tab: VfsTab]
}>()
const resolvedTabs = () => {
  if (!props.tabs || props.tabs.length === 0) return ALL_TABS
  return props.tabs
}
const showTabsHeader = computed(() => resolvedTabs().length > 1)

async function trySwitchTab(nextTab: VfsTab): Promise<void> {
  if (nextTab === activeTab.value) return
  if (props.beforeTabChange) {
    const result = props.beforeTabChange(nextTab)
    const ok = result instanceof Promise ? await result : result
    if (!ok) return
  }
  activeTab.value = nextTab
  emits('tabChanged', nextTab)
}

/** Skip `beforeTabChange` after an explicit user decision (e.g. unsaved dialog). */
function forceSwitchTab(nextTab: VfsTab): void {
  if (nextTab === activeTab.value) return
  activeTab.value = nextTab
  emits('tabChanged', nextTab)
}

defineExpose({ forceSwitchTab })
</script>

<template>
  <section class="vfs-tab-shell">
    <header v-if="showTabsHeader" class="vfs-tabs">
      <div class="vfs-tabs__primary" role="tablist" aria-label="虚拟文件系统">
        <button
          v-for="tab in resolvedTabs()"
          :key="tab"
          type="button"
          :class="['menu_button', 'vfs-tab', { active: activeTab === tab }]"
          :title="TAB_LABELS[tab]"
          :aria-label="TAB_LABELS[tab]"
          @click="void trySwitchTab(tab)"
        >
          <span>{{ TAB_LABELS[tab] }}</span>
        </button>
      </div>
      <!-- WHY: trailing area stays visually empty until a parent (e.g. editor snapshot tools) mounts into this slot. -->
      <div class="vfs-tabs__trailing">
        <slot name="tabs-trailing" :active-tab="activeTab" />
      </div>
    </header>
    <div class="vfs-tab-content">
      <slot :active-tab="activeTab" />
    </div>
  </section>
</template>

<style scoped>
.vfs-tab-shell {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
}

.vfs-tabs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 6px;
  padding-bottom: 6px;
  flex: 0 0 auto;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.14);
}

.vfs-tabs__primary {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  flex: 1 1 auto;
  min-width: 0;
  white-space: nowrap;
}

.vfs-tabs__trailing {
  margin-left: auto;
  /* WHY: `0 0 auto` kept the snapshot row wider than the row remainder and clipped the rollback button; allow shrink + cap width to the tab bar. */
  flex: 0 1 auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
}

.vfs-tabs__trailing:empty {
  display: none;
}

.vfs-tab-content {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
}
.vfs-tab {
  writing-mode: horizontal-tb;
  white-space: nowrap;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 1px solid transparent;
  background: transparent;
  opacity: 0.9;
  transition: background 120ms ease, border-color 120ms ease, opacity 120ms ease;
}

.vfs-tab:hover {
  opacity: 1;
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.12);
}

.vfs-tab.active {
  opacity: 1;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.22);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.18);
}
</style>
