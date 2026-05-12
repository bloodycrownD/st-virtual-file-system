/**
 * @file Entry point for the `st-virtual-file-system` extension.
 *
 * This module performs two independent responsibilities:
 *
 * - **UI mount (optional)**: If SillyTavern's extension settings container exists, mount the Vue
 *   settings UI into that container.
 * - **Runtime wiring (always)**: Initialize persistence and connect the message/event pipeline so
 *   virtual tool calls can update the VFS state.
 *
 * ## Initialization order (why it matters)
 *
 * 1) **Persistence store first**: loads extension/global + chat/session state so subsequent services
 *    can read/write snapshots safely.
 * 2) **Snapshot/template services**: template initialization may populate an initial snapshot for the current chat.
 * 3) **Runtime + message handling**: only after state/services exist do we wire the message pipeline
 *    to SillyTavern's event source.
 *
 * Note: event listeners for `CHAT_CHANGED` are owned by the persistence singleton
 * (`initVfsPersistenceStore`) so chat reload is centralized and not duplicated across adapters.
 */
import { createApp } from 'vue'
import App from './App.vue'
import '@/styles/st-vfs-dialog.css'
import '@/styles/st-vfs-entry.css'
import { initVfsPersistenceStore, registerVfsChatReloadHook, vfsPersistenceStore, vfsSnapshotService } from '@/app/stores/vfs-store-singleton'
import { createMessageController } from '@/app/controllers/message-controller'
import { createMessagePipeline } from '@/app/services/message/message-pipeline'
import { createStMessageEventAdapter } from '@/infra/sillytarvern/events/st-event-adapter'
import { ToolDispatcher } from '@/app/services/virtual-tools/tool-dispatcher'
import { ChatVfsLogService } from '@/app/services/vfs-log/chat-vfs-log-service'
import { ChatVfsRuntime } from '@/app/services/vfs-runtime/chat-vfs-runtime'
import { ExtensionVfsTemplateService } from '@/app/services/vfs-runtime/extension-vfs-template-service'
import { VirtualToolMessageHandler } from '@/app/services/message/virtual-tool-message-handler'
import { registerVfsMacros } from '@/infra/sillytarvern/macros/register-vfs-macros'
import { mountVfsEntryButton } from '@/app/bootstrap/mountVfsEntry'
import { unmountVfsEntry } from '@/app/bootstrap/unmountVfsEntry'

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
// Runtime wiring order:
// - store first (loads chat/extension snapshots)
// - version + template services (template init depends on version service)
// - ST prompt macros read the same store snapshot (sync handlers)
// - runtime + handler wired into message pipeline and ST event source
const templateService = new ExtensionVfsTemplateService(vfsPersistenceStore)
templateService.initializeChatFromTemplateIfNeeded()
registerVfsChatReloadHook(templateService.initializeChatFromTemplateIfNeeded.bind(templateService))
registerVfsMacros(vfsPersistenceStore, templateService.initializeChatFromTemplateIfNeeded.bind(templateService))
const runtime = new ChatVfsRuntime(vfsPersistenceStore, new ToolDispatcher(), vfsSnapshotService, templateService)
const logs = new ChatVfsLogService(vfsPersistenceStore)
const messageHandler = new VirtualToolMessageHandler(runtime, logs)
const controller = createMessageController(createMessagePipeline(messageHandler))
createStMessageEventAdapter(controller).start()
mountVfsEntryButton()

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    unmountVfsEntry()
  })
}
