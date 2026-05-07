# st-virtual-file-system

SillyTavern 第三方扩展：虚拟文件系统（VFS）实验项目。  
当前已提供一个最小可用配置页，并完成 `extensionSettings + chatMetadata` 持久化抽象骨架。

## 功能现状

- 在扩展设置页挂载 `虚拟文件系统配置` 面板
- 配置项：
  - `启用虚拟文件系统`（布尔开关）
- 持久化能力：
  - 扩展级：`extensionSettings`
  - 会话级：`chatMetadata`
- 项目使用 Vue 3 + TypeScript + Vite

## 安装与使用

1. 将项目放在 SillyTavern 扩展目录下（当前约定）：
   - `public/scripts/extensions/third-party/st-virtual-file-system`
2. 安装依赖：
   - `npm install`
3. 构建扩展：
   - `npm run build`
4. 确认 `manifest.json` 中入口为：
   - `dist/index.js`
5. 重启或刷新 SillyTavern，在扩展列表启用本扩展。

## 开发命令

- 本地开发（Vite）：
  - `npm run dev`
- 单元测试：
  - `npm run test:run`
- 覆盖率：
  - `npm run test:coverage`
- 构建：
  - `npm run build`

## 目录说明（核心）

- `src/main.ts`：扩展入口与挂载逻辑
- `src/App.vue`：当前配置页 UI
- `src/infra/persistence/`：持久化 adapter/schema
- `src/app/stores/`：持久化 store 与单例接线
- `docs/Iterations/持久化抽象重构/`：需求与设计文档
- `memory/`：项目记忆与知识索引

## 持久化设计说明

采用轻量三层：

- Adapter：只负责调用 SillyTavern 官方上下文 API
- Schema：负责默认值、解析、序列化边界
- Store：负责业务状态与显式持久化写入

设计目标是避免“大而全 manager”造成的时序与引用问题，尤其遵守官方建议：  
不要长期缓存 `chatMetadata` 引用。

## Store 使用方式

`VFS` 对外统一通过 `vfsPersistenceStore` 读写状态，推荐只在 UI/业务层调用 store，不直接操作 `SillyTavern.getContext()`。

### 1) 初始化（只执行一次）

在扩展入口执行初始化：

```ts
import { initVfsPersistenceStore } from '@/app/stores/vfs-store-singleton'

initVfsPersistenceStore()
```

初始化会做两件事：
- 读取并归一化 `extensionSettings + chatMetadata`
- 自动监听 `CHAT_CHANGED`，切换聊天时重载 chat 级状态

### 2) 读取状态

```ts
import { vfsPersistenceStore } from '@/app/stores/vfs-store-singleton'

const state = vfsPersistenceStore.getState()
console.log(state.extension.enabled)
console.log(state.chat.mounted)
```

说明：
- `getState()` 返回快照（非内部可变引用），避免外部误改内部状态。

### 3) 订阅状态变化

```ts
const unsubscribe = vfsPersistenceStore.subscribe((state) => {
  // 每次 init/reload/set 后都会触发
  console.log('extension enabled:', state.extension.enabled)
})

// 组件卸载时记得取消
unsubscribe()
```

### 4) 写入状态（推荐方式）

```ts
vfsPersistenceStore.setExtensionEnabled(true) // 写 extensionSettings + saveSettingsDebounced
vfsPersistenceStore.setChatMounted(true)      // 写 chatMetadata + saveMetadata
```

说明：
- 不建议绕过 store 直接写 context；否则会破坏一致性与测试边界。

### 5) 在 Vue 中接入示例

```ts
import { onMounted, onUnmounted, ref } from 'vue'
import { initVfsPersistenceStore, vfsPersistenceStore } from '@/app/stores/vfs-store-singleton'

const enabled = ref(false)
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
})
```
