<script setup lang="ts">
import { ref } from 'vue'

const ALL_TABS = ['files', 'history', 'logs'] as const
type VfsTab = (typeof ALL_TABS)[number]
const activeTab = ref<VfsTab>('files')
const TAB_LABELS: Record<VfsTab, string> = {
  files: '文件管理器',
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
        :class="{ active: activeTab === tab }"
        @click="trySwitchTab(tab)"
      >
        {{ TAB_LABELS[tab] }}
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
}
.active {
  font-weight: 700;
}
</style>
