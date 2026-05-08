<script setup lang="ts">
import { ref } from 'vue'

const tabs = ['files', 'history', 'logs'] as const
const activeTab = ref<(typeof tabs)[number]>('files')
</script>

<template>
  <section class="vfs-tab-shell">
    <header class="vfs-tabs">
      <button
        v-for="tab in tabs"
        :key="tab"
        type="button"
        :class="{ active: activeTab === tab }"
        @click="activeTab = tab"
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
