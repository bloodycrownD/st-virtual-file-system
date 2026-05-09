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
  beforeTabChange?: (nextTab: VfsTab) => boolean
}>()
const emits = defineEmits<{
  tabChanged: [tab: VfsTab]
}>()
const resolvedTabs = () => {
  if (!props.tabs || props.tabs.length === 0) return ALL_TABS
  return props.tabs
}
const showTabsHeader = computed(() => resolvedTabs().length > 1)

function trySwitchTab(nextTab: VfsTab): void {
  if (nextTab === activeTab.value) return
  if (props.beforeTabChange && !props.beforeTabChange(nextTab)) return
  activeTab.value = nextTab
  emits('tabChanged', nextTab)
}
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
        @click="trySwitchTab(tab)"
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
.vfs-tabs {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
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
