# VFS 开发前置：项目记忆基线

## 日期

2026-05-06

## 背景

仅有需求 `spec` 仍不足以稳定推进实现。为了避免会话中断后丢失关键上下文，需要把“如何接入 SillyTavern、当前项目锚点在哪里、哪些约束不能踩”沉淀为开发基线。

## 结论 / 事实

- **需要整理，而且是必须整理**：VFS 开发不能只“对照数据库项目照抄”，必须明确可复用模块与不可复用边界（SQL 引擎逻辑基本不可复用，扩展接入骨架可复用）。
- **当前项目的扩展接入锚点**（可直接复用）：
  - `manifest.json`：扩展入口声明，`js` 指向打包产物（当前是 `dist/index.js`）
  - `src/main.ts`：Vue 应用挂载到 `#extensions_settings`
  - `src/infra/sillytarvern/persistent/extension-setting-manager.ts`：全局持久化模式（`extensionSettings[MODULE_NAME]` + `saveSettingsDebounced()`）
- **SillyTavern API 最小必用集合**（VFS 第一版建议）：
  - `SillyTavern.getContext()`：统一获取 `extensionSettings/chatMetadata/chat/saveChat/saveMetadata`
  - 事件系统：`eventSource.on(event_types.CHAT_CHANGED | MESSAGE_RECEIVED | MESSAGE_DELETED | SETTINGS_LOADED_AFTER, ...)`
  - 通知与交互：`toastr` / `Popup`
- **UI 锚点结论**：
  - 扩展设置页锚点：`#extensions_settings`（当前项目已验证可用）
  - 聊天区附加 UI 若需底部展示，可参考 `#chat` + `insertAdjacentHTML('beforeend', ...)` 的挂载思路（见 `SillyTavern-tableStatusContainer挂载原理.md`）
- **命名空间存储建议（与已确认需求对齐）**：
  - Global VFS：`extensionSettings[MODULE_NAME].vfsGlobal`
  - Chat 私有 VFS：`chatMetadata[MODULE_NAME].vfsChat`
  - 严格隔离：核心服务层禁止跨命名空间访问 API（不是只在 UI 上隐藏）
- **版本能力（每文件最近 N 个）落地建议**：
  - 文件结构里显式维护 `versions[]`（含版本号、时间戳、内容快照）
  - 每次 `write/append/patch` 后入栈并裁剪到 `N`
  - 回滚本质是“把目标版本内容复制为新当前版本”，而不是直接覆盖历史记录

## 影响 / 下一步

- 实现前先固定 3 份文档（避免后续失忆）：
  1. `VFS-核心数据模型.md`（目录/文件/版本结构 + path 规则）
  2. `VFS-命令API契约.md`（入参/返回/错误码）
  3. `VFS-UI锚点与交互流.md`（面板入口、树、编辑器、版本面板）
- 代码实现阶段按“接入骨架复用 + 业务引擎重写”执行：
  - 复用：manifest/main.ts/设置持久化模式/事件监听范式
  - 重写：SQL parser/executor 与数据模型全部替换为 VFS core service

