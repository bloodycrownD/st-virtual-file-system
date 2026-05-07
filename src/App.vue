<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { createMessageController } from '@/app/controllers/message-controller'
import { createMessagePipeline } from '@/app/services/message/message-pipeline'
import { initVfsPersistenceStore, vfsPersistenceStore } from '@/app/stores/vfs-store-singleton'
import { createStMessageEventAdapter } from '@/infra/sillytarvern/events/st-event-adapter'

const enabled = ref(true)
let unsubscribe: (() => void) | null = null

const messageEventAdapter = createStMessageEventAdapter(createMessageController(createMessagePipeline()))

onMounted(() => {
  initVfsPersistenceStore()
  messageEventAdapter.start()
  enabled.value = vfsPersistenceStore.getState().extension.enabled
  unsubscribe = vfsPersistenceStore.subscribe((state) => {
    enabled.value = state.extension.enabled
  })
})

onUnmounted(() => {
  messageEventAdapter.stop()
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
