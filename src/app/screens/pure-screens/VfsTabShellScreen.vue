<script setup lang="ts">
import { ref } from 'vue'

const tabs = ['files', 'history', 'logs'] as const
const activeTab = ref<(typeof tabs)[number]>('files')
const props = defineProps<{
  beforeTabChange?: (nextTab: (typeof tabs)[number]) => boolean
}>()

function trySwitchTab(nextTab: (typeof tabs)[number]): void {
  if (nextTab === activeTab.value) return
  if (props.beforeTabChange && !props.beforeTabChange(nextTab)) return
  activeTab.value = nextTab
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
        {{ tab }}
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
