/**
 * SillyTavern 扩展入口（由 manifest.json -> dist/index.js 加载）。
 * 不在普通网页里挂载 #app，而是挂到扩展设置页容器，与 SillyTavern UI 同源。
 */
import { createApp } from 'vue'
import App from './App.vue'

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
