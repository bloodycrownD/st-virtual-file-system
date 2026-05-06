<script setup lang="ts">
import { onMounted, ref } from 'vue'

const extensionName = 'st-virtual-file-system'
const enabled = ref(true)

onMounted(() => {
  if (typeof SillyTavern === 'undefined') {
    return
  }

  const context = SillyTavern.getContext()
  const settings = (context.extensionSettings[extensionName] ??= {})
  enabled.value = Boolean(settings.enabled ?? true)
})

const handleToggle = () => {
  if (typeof SillyTavern === 'undefined') {
    return
  }

  const context = SillyTavern.getContext()
  const settings = (context.extensionSettings[extensionName] ??= {})
  settings.enabled = enabled.value
  context.saveSettingsDebounced()
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
