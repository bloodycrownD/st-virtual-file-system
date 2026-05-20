<!--
  扩展「设置页」UI：启用开关、检查点保留条数等。
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
/** 消息标签通道 JSON 自动修复（保守策略） */
const virtualToolJsonRepairEnabled = ref(true)
/** 消息标签通道成功批次是否在 result 中展示完整 calls[].args（默认关） */
const virtualToolResultFullArgsEnabled = ref(false)
/** 检查点 FIFO 上限（`snapshotMaxCount` 持久化键名不变，扩展设置） */
const snapshotMaxCount = ref(10)
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
  virtualToolJsonRepairEnabled.value = vfsPersistenceStore.getState().extension.virtualToolJsonRepairEnabled
  virtualToolResultFullArgsEnabled.value = vfsPersistenceStore.getState().extension.virtualToolResultFullArgsEnabled
  snapshotMaxCount.value = vfsPersistenceStore.getState().extension.snapshotMaxCount
  /** 别处若改了 extension，表单仍能同步（简单订阅模型） */
  unsubscribe = vfsPersistenceStore.subscribe((state) => {
    enabled.value = state.extension.enabled
    virtualToolJsonRepairEnabled.value = state.extension.virtualToolJsonRepairEnabled
    virtualToolResultFullArgsEnabled.value = state.extension.virtualToolResultFullArgsEnabled
    snapshotMaxCount.value = state.extension.snapshotMaxCount
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

const handleJsonRepairToggle = () => {
  vfsPersistenceStore.updateExtension((draft) => ({
    ...draft,
    virtualToolJsonRepairEnabled: virtualToolJsonRepairEnabled.value,
  }))
}

const handleResultFullArgsToggle = () => {
  vfsPersistenceStore.updateExtension((draft) => ({
    ...draft,
    virtualToolResultFullArgsEnabled: virtualToolResultFullArgsEnabled.value,
  }))
}

const handleSnapshotMaxCountChange = () => {
  const n = Number(snapshotMaxCount.value)
  if (!Number.isFinite(n)) return
  const clamped = Math.min(500, Math.max(1, Math.floor(n)))
  snapshotMaxCount.value = clamped
  vfsPersistenceStore.updateExtension((draft) => ({ ...draft, snapshotMaxCount: clamped }))
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
          <label class="checkbox_label vfs-json-repair">
            <input v-model="virtualToolJsonRepairEnabled" type="checkbox" @change="handleJsonRepairToggle" />
            <span>启用工具调用 JSON 自动修复（仅消息标签通道）</span>
          </label>
          <p class="vfs-hint">采用保守策略；低把握场景不执行</p>
          <label class="checkbox_label vfs-json-repair">
            <input v-model="virtualToolResultFullArgsEnabled" type="checkbox" @change="handleResultFullArgsToggle" />
            <span>成功时在消息结果中展示完整工具入参（仅消息标签通道）</span>
          </label>
          <p class="vfs-hint">默认关闭；开启后 &lt;virtual-tool-result&gt; 的 calls 含完整 args，可能增大消息体积</p>
          <label class="vfs-field">
            <span class="vfs-field-label">检查点保留条数（FIFO，1–500）</span>
            <input
              v-model.number="snapshotMaxCount"
              class="vfs-number-input"
              type="number"
              min="1"
              max="500"
              @change="handleSnapshotMaxCountChange"
            />
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

.vfs-json-repair {
  margin-top: 10px;
}

.vfs-hint {
  margin: 4px 0 0 24px;
  font-size: 0.85em;
  opacity: 0.8;
}

.vfs-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 12px;
}

.vfs-field-label {
  font-size: 0.95em;
  opacity: 0.9;
}

.vfs-number-input {
  max-width: 120px;
}

.vfs-actions {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.vfs-actions .menu_button {
  writing-mode: horizontal-tb;
  white-space: nowrap;
}
</style>
