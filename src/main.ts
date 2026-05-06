import { createApp } from 'vue'
import App from './App.vue'

const container = document.createElement('div')
container.id = 'st-vfs-settings-root'

const extensionsSettings = document.querySelector('#extensions_settings')
if (extensionsSettings) {
  extensionsSettings.appendChild(container)
  const app = createApp(App)
  app.mount(container)
}
