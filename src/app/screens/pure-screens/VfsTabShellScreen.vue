<script setup lang="ts">
import { computed, ref } from 'vue'

const ALL_TABS = ['files', 'history', 'logs'] as const
type VfsTab = (typeof ALL_TABS)[number]
const activeTab = ref<VfsTab>('files')
const TAB_LABELS: Record<VfsTab, string> = {
  files: '文件管理',
  history: '提交记录',
  logs: '日志',
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
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
  flex: 0 0 auto;
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
}
.active {
  font-weight: 700;
}
</style>
