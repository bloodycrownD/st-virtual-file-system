/**
 * SillyTavern 扩展入口（由 manifest.json -> dist/index.js 加载）。
 * 不在普通网页里挂载 #app，而是挂到扩展设置页容器，与 SillyTavern UI 同源。
 */
import { createApp } from 'vue'
import App from './App.vue'
import { initVfsPersistenceStore, vfsPersistenceStore } from '@/app/stores/vfs-store-singleton'
import { createMessageController } from '@/app/controllers/message-controller'
import { createMessagePipeline } from '@/app/services/message/message-pipeline'
import { createStMessageEventAdapter } from '@/infra/sillytarvern/events/st-event-adapter'
import { ToolDispatcher } from '@/app/services/virtual-tools/tool-dispatcher'
import { ChatVfsVersionService } from '@/app/services/vfs-version/chat-vfs-version-service'
import { ChatVfsLogService } from '@/app/services/vfs-log/chat-vfs-log-service'
import { ChatVfsRuntime } from '@/app/services/vfs-runtime/chat-vfs-runtime'
import { ExtensionVfsTemplateService } from '@/app/services/vfs-runtime/extension-vfs-template-service'
import { VirtualToolMessageHandler } from '@/app/services/message/virtual-tool-message-handler'

/** 包住整棵 Vue 树的 DOM 节点，便于在 DevTools / 测试中定位 */
const container = document.createElement('div')
container.id = 'st-vfs-settings-root'

/** ST 预留的扩展设置挂载点；存在则挂载配置页 UI */
const extensionsSettings = document.querySelector('#extensions_settings')
if (extensionsSettings) {
  extensionsSettings.appendChild(container)
  const app = createApp(App)
  app.mount(container)
}

initVfsPersistenceStore()
const versionService = new ChatVfsVersionService(vfsPersistenceStore)
const templateService = new ExtensionVfsTemplateService(vfsPersistenceStore, versionService)
templateService.initializeChatFromTemplateIfNeeded()
const runtime = new ChatVfsRuntime(vfsPersistenceStore, new ToolDispatcher(), versionService)
const logs = new ChatVfsLogService(vfsPersistenceStore)
const messageHandler = new VirtualToolMessageHandler(runtime, logs)
const controller = createMessageController(createMessagePipeline(messageHandler))
createStMessageEventAdapter(controller).start()
