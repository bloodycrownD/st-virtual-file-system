<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { initVfsPersistenceStore, vfsPersistenceStore } from '@/app/stores/vfs-store-singleton'

const enabled = ref(true)
let unsubscribe: (() => void) | null = null

onMounted(() => {
  initVfsPersistenceStore()
  enabled.value = vfsPersistenceStore.getState().extension.enabled
  unsubscribe = vfsPersistenceStore.subscribe((state) => {
    enabled.value = state.extension.enabled
  })
})

onUnmounted(() => {
  unsubscribe?.()
  unsubscribe = null
})

const handleToggle = () => {
  vfsPersistenceStore.setExtensionEnabled(enabled.value)
}
</script>

<template>
  <div class="vfs-settings-root">
    <div class="inline-drawer">
      <div class="inline-drawer-toggle inline-drawer-header">
        <div class="vfs-title-row">
          <b>虚拟文件系统配置</b>
        </div>
        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
      </div>
      <div class="inline-drawer-content">
        <div class="vfs-panel">
          <label class="checkbox_label">
            <input v-model="enabled" type="checkbox" @change="handleToggle" />
            <span>启用虚拟文件系统</span>
          </label>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.vfs-settings-root,
.inline-drawer,
.inline-drawer-content {
  width: 100%;
}

.vfs-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.vfs-panel {
  padding: 10px;
}
</style>
