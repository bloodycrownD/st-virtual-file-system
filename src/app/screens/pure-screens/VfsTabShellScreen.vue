<script setup lang="ts">
import { ref } from 'vue'

const ALL_TABS = ['files', 'history', 'logs'] as const
type VfsTab = (typeof ALL_TABS)[number]
const activeTab = ref<VfsTab>('files')
const TAB_LABELS: Record<VfsTab, string> = {
  files: '文件管理',
  history: '提交记录',
  logs: '日志',
}
const TAB_ICONS: Partial<Record<VfsTab, string>> = {
  files: 'fa-solid fa-folder-tree',
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

function trySwitchTab(nextTab: VfsTab): void {
  if (nextTab === activeTab.value) return
  if (props.beforeTabChange && !props.beforeTabChange(nextTab)) return
  activeTab.value = nextTab
  emits('tabChanged', nextTab)
}
</script>

<template>
  <section class="vfs-tab-shell">
    <header class="vfs-tabs">
      <button
        v-for="tab in resolvedTabs()"
        :key="tab"
        type="button"
        :class="['menu_button', 'vfs-tab', { active: activeTab === tab }]"
        :title="TAB_LABELS[tab]"
        :aria-label="TAB_LABELS[tab]"
        @click="trySwitchTab(tab)"
      >
        <i v-if="TAB_ICONS[tab]" :class="TAB_ICONS[tab]" aria-hidden="true"></i>
        <span v-else>{{ TAB_LABELS[tab] }}</span>
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
.vfs-tab i {
  font-size: 14px;
  line-height: 1;
}
.active {
  font-weight: 700;
}
</style>
