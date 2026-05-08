<!--
  扩展「设置页」UI：纯展示 + 一个开关。
  数据来自 vfsPersistenceStore（extensionSettings）；消息事件管线在下方按需启动/停止。
-->
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { createMessageController } from '@/app/controllers/message-controller'
import { createMessagePipeline } from '@/app/services/message/message-pipeline'
import { initVfsPersistenceStore, vfsPersistenceStore } from '@/app/stores/vfs-store-singleton'
import { createStMessageEventAdapter } from '@/infra/sillytarvern/events/st-event-adapter'
import { useVfsPopupLifecycle } from '@/app/composables/screens-composables/useVfsPopupLifecycle'

/** 与 checkbox 双向绑定；勾选状态变化时在 handleToggle 里写回 store */
const enabled = ref(true)
/** store.subscribe 返回的取消函数，组件卸载时调用，防止内存泄漏 */
let unsubscribe: (() => void) | null = null

/**
 * 依赖链（从外到内）：
 * eventAdapter ← controller ← pipeline
 * Adapter 只在 start() 时向 ST 注册事件；真正业务在 pipeline（当前为桩实现）。
 */
const messageEventAdapter = createStMessageEventAdapter(createMessageController(createMessagePipeline()))
const popup = useVfsPopupLifecycle()

onMounted(() => {
  /** 初始化持久化 + 监听 CHAT_CHANGED 以重载 chatMetadata 对应内存状态 */
  initVfsPersistenceStore()
  /** 注册 MESSAGE_RECEIVED / EDITED / DELETED 等（不注册 CHAT_CHANGED，交给上面） */
  messageEventAdapter.start()
  enabled.value = vfsPersistenceStore.getState().extension.enabled
  /** 别处若改了 extension.enabled，勾选框仍能同步（简单订阅模型） */
  unsubscribe = vfsPersistenceStore.subscribe((state) => {
    enabled.value = state.extension.enabled
  })
})

onUnmounted(() => {
  /** 必须解绑事件，避免组件销毁后仍回调 */
  messageEventAdapter.stop()
  unsubscribe?.()
  unsubscribe = null
})

/** v-model + @change：把 UI 勾选结果持久化到 extensionSettings */
const handleToggle = () => {
  vfsPersistenceStore.setExtensionEnabled(enabled.value)
}

const openTemplateManager = () => {
  popup.open({ scope: 'template', title: '模板管理' })
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
          <div class="vfs-actions">
            <button type="button" class="menu_button" @click="openTemplateManager">模板管理</button>
          </div>
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

.vfs-actions {
  margin-top: 10px;
}
</style>
