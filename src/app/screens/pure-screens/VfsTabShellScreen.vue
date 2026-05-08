<script setup lang="ts">
import { ref } from 'vue'

const tabs = ['files', 'history', 'logs'] as const
const activeTab = ref<(typeof tabs)[number]>('files')
const TAB_LABELS: Record<(typeof tabs)[number], string> = {
  files: '文件管理器',
  history: '提交记录',
  logs: '日志',
}
const props = defineProps<{
  beforeTabChange?: (nextTab: (typeof tabs)[number]) => boolean
}>()
const emits = defineEmits<{
  tabChanged: [tab: (typeof tabs)[number]]
}>()

function trySwitchTab(nextTab: (typeof tabs)[number]): void {
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
        v-for="tab in tabs"
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
