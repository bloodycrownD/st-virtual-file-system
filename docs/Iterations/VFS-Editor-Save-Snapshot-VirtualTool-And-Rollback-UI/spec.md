# VFS 编辑器保存 / 虚拟工具时机 / 回滚 UI 优化 技术规格（SPEC）

## 设计目标

- 对齐 [`prd.md`](./prd.md)：修复「编辑保存后虚拟工具不执行、刷新才执行」；chat 编辑器 **保存即快照**（去掉独立「保存快照」）；将快照选择与回滚 **并入预览 header 工具行**，并统一视觉与可读标签。
- 基于当前代码事实：不凭空假设 SillyTavern 事件名，但在本仓库内将 **MESSAGE_UPDATED** 与 **MESSAGE_EDITED** 在管道层对齐为同一类「可携带消息正文变更」事件；依赖既有 `VirtualToolMessageHandler` 的 `chatId:messageId` 锁避免并发双跑。

---

## Bug 根因分析（虚拟工具）

### 现状链路

1. `main.ts` 将 `VirtualToolMessageHandler` 接入 `createMessagePipeline`，经 `createMessageController` + `createStMessageEventAdapter().start()` 订阅 ST `eventSource`。
2. `st-event-adapter.ts`：当 `event_types.MESSAGE_EDITED` 与 `MESSAGE_UPDATED` **不是同一字符串** 时，会分别注册两个监听；`MESSAGE_EDITED` → `onMessageEdited` → `pipeline.run({ kind: 'MESSAGE_EDITED' })`；`MESSAGE_UPDATED` → `onMessageUpdated` → `pipeline.run({ kind: 'MESSAGE_UPDATED' })`。
3. **`message-pipeline.ts` 第 61–63 行**仅当 `kind === 'MESSAGE_RECEIVED' || kind === 'MESSAGE_EDITED'` 时才调用 `handler.process`；对 **`MESSAGE_UPDATED` 直接 return**，不读消息、不执行虚拟工具。
4. 用户「保存编辑后的消息」若在当前 SillyTavern 版本只派发 **`MESSAGE_UPDATED`**（或与 `MESSAGE_EDITED` 不同名、且保存路径未触发 `MESSAGE_EDITED`），则扩展**完全跳过**虚拟工具管道；整页刷新后重新加载聊天，可能走 `MESSAGE_RECEIVED` 或其它路径，因而表现为「刷新后才生效」。

### 结论

- **主因**：管道层对 `MESSAGE_UPDATED` 的**显式排除**，与适配器仍向管道投递该 kind 的行为不一致。
- **并发**：`VirtualToolMessageHandler` 已对 `chatId:messageId` 加锁（见 `virtual-tool-message-handler.ts` 注释），在 `EDITED` 与 `UPDATED` 短时间双发时，第二条可安全 `handled: false`，满足「至多执行一次」。

### 次要风险（实现时注意，不阻塞本迭代默认范围）

- 若某 ST 版本在 `UPDATED` 回调时 **`context.chat[i].mes` 尚未写入新文本**，而仅 `args[1]` 携带新正文，则当前管道**优先读 record**（`message-pipeline.ts` 第 71–74 行）可能读到旧文本。本迭代以「先打通 UPDATED 路径」为主；若单测或实测仍复现，再在管道内为 `MESSAGE_UPDATED` 增加「args 优先」或「取较新」策略并补测（见风险节）。

---

## 总体方案

### A. 虚拟工具：`MESSAGE_UPDATED` 与 `MESSAGE_EDITED` 等价处理

- 在 **`message-pipeline.ts`** 将虚拟工具委托条件扩展为：`MESSAGE_RECEIVED || MESSAGE_EDITED || MESSAGE_UPDATED`。
- 更新该文件头部 **Current behavior** 注释，避免文档与代码再次漂移。
- **不**改 `st-event-adapter` 的注册策略（保持对「两常量同值」的去重），避免重复注册同名事件。

### B. Chat 编辑器：保存 = 预写快照 + 写文件（单次持久化）

- **产品**：每次成功保存均生成一条可回滚快照（PRD 已定）；与已移除的「相机」手动快照语义一致：**锚点为保存前的该文件路径状态**。
- **实现**：在 **`ChatVfsSnapshotService`** 增加一次性方法（命名示例）`persistChatFileSaveWithPreSnapshot(path, content)`（或等价私有辅助 + 单处 `updateChat`）：
  - 在**同一** `vfsPersistenceStore.updateChat` 回调内：
    1. 读取 `draft.chatVfsSnapshot` 作为 `before`；
    2. 用现有 `buildManualRecordForPath(before, path)` 生成 manifest 记录（`kind` 维持 **`'manual'`**，与既有 schema 一致，避免无意义枚举膨胀）；
    3. 用 `VfsCore` `importSnapshot` → `writeFile` → `exportSnapshot` 得到新树；
    4. 写回 `draft.chatVfsSnapshot`，并将记录 `mergeIntoChatSnapshots(draft.chatVfsSnapshots, record)`。
  - **禁止**先 `persistManualSnapshotForPath` 再 `applySnapshotMutation` 的两段式默认路径，以免中间失败造成「快照与文件不一致」窗口（对齐 PRD「不应静默分裂」）。
- **`VfsMainScreen.vue` `handleEditorSaveRequested`**：在 `!isTemplateScope` 时调用上述新方法替代「仅 `applySnapshotMutation`」；模板域仍走原 `applySnapshotMutation`（无 `chatVfsSnapshots`）。
- **删除**：`handleManualSnapshotRequested`、header 相机按钮（`data-testid="editor-manual-snapshot"`）、以及对 `vfsSnapshotService.persistManualSnapshotForPath` 的该路径调用（若其它处仍需要可保留服务方法供内部复用）。

### C. 回滚 UI：迁入 header，下拉 + 按钮

- **`VfsMainScreen.vue`** 预览 chrome（`vfs-preview-chrome-actions`）在 **`mode === 'editor' && !isTemplateScope`** 时追加：
  - **`<select>`**（或带 `role="combobox"` 的轻量封装）：`v-model` 绑定当前选中 `snapshotId`；`option` 的 `value` 为 `snapshotId`，展示文案由格式化函数生成（见下）。
  - **「回滚」按钮**：`class` 与现有 `menu_button vfs-preview-chrome-button` 一致；`disabled` 逻辑：未选中、或 `rollbackInProgress`；`aria-busy` 与保存按钮一致模式。
  - 点击回滚：调用现有 `handleEditorSnapshotRollback({ snapshotId })`（内部已 `useVfsSnapshotRollback` + `refreshAuthoritativeState`）。
- **`EditorScreen.vue`**：
  - 移除底部 **`aside`「History」** 整块（列表 + `fieldset` 单选 + Rollback），避免与 PRD冲突。
  - 将 **`show-history-controls` / `history-records`** 等仅服务该 aside 的 props 与相关 emit 删除或收敛（若 `embedToolbar: true` 的独立工具栏场景仍需保存按钮，可保留 `saveRequested` 与精简 toolbar；当前仓库仅 `VfsMainScreen` 以 `embed-toolbar="false"` 引用，以实现为准**删繁就简**）。
  - 移除 `@manual-rollback-requested` 在 `VfsMainScreen` 上的监听（改由 header 直调 `handleEditorSnapshotRollback`）。
- **下拉展示格式**：避免 `时间 + kind + 路径` 无分隔拼接；建议 `toLocaleString('zh-CN', { hour12: false })` + 固定后缀 **「还原点」**，或 `HH:mm:ss` + 文件名 `basename(path)`（数据来自 `editorHistoryRecords` / 或直接从 `chatVfsSnapshots` 过滤当前 `activeContextPath` 的项）。**不在 UI 强调** `manual` / `tool-batch-pre` 英文区分（与 PRD「保存与快照合一」一致）；若需区分工具批次与保存，可用极短中文后缀「工具前」「保存前」映射 `kind`（可选，实现阶段择优）。

### D. 样式

- 为 header 内 `<select>` 增加 scoped 类（如 `vfs-preview-chrome-select`）：`min-width`、`max-width`、`height`、背景/边框与 `vfs-preview-chrome-button` 所在行一致（参考同文件已有 `.vfs-preview-chrome-*`）。
- `flex-wrap: wrap` 已存在于父级时，保证窄屏下 **select 整组 + 回滚按钮** 可折行但不与标题重叠（必要时给 chrome 容器 `flex-wrap: wrap` + `justify-content: flex-end`）。

---

## 最终项目结构

无新增包目录；变更集中在：

- `src/app/services/message/message-pipeline.ts`
- `src/app/services/vfs-snapshot/chat-vfs-snapshot-service.ts`
- `src/app/screens/business-screens/VfsMainScreen.vue`
- `src/app/screens/pure-screens/EditorScreen.vue`
- `test/`：管道单测、`chat-vfs-snapshot-service.spec.ts` 或 `vfs-ui-cr-loop.spec.ts` 选择性增补

---

## 变更点清单

| 区域 | 文件 | 变更摘要 |
|------|------|----------|
| 管道 | `message-pipeline.ts` | `MESSAGE_UPDATED` 与 `RECEIVED`/`EDITED` 一样进入 `handler.process`；注释同步 |
| 快照服务 | `chat-vfs-snapshot-service.ts` | 新增单事务「保存前 manifest + 写文件」API；内部复用 `buildManualRecordForPath` + `mergeIntoChatSnapshots` |
| 主屏 | `VfsMainScreen.vue` | chat 保存走新 API；header 增加 select+回滚；删相机与手动快照处理；`EditorScreen` 去历史 props/事件 |
| 编辑器纯屏 | `EditorScreen.vue` | 移除 History aside 及相关 props/computed；保留编辑/预览/行号核心 |
| 类型/常量 | 无强制变更 | `ChatVfsSnapshotKind` 可继续仅 `manual` \| `tool-batch-pre` |
| 测试 | `message-controller` / 新 vitest | `pipeline.run({ kind: 'MESSAGE_UPDATED', args: [...] })` 应触发 mock handler；快照+保存单测；更新 UI 测中对 `editor-history-rollback-list` 的断言（见下） |

---

## 详细实现步骤

1. **message-pipeline**：扩展 kind 判断；补 DEV `console.debug` 若保留则包含 UPDATED。
2. **Vitest**：`VirtualToolMessageHandler` 用 mock，`createMessagePipeline(handler).run({ kind: 'MESSAGE_UPDATED', args: [0, '<virtual-tool-call>...'] })` 断言 `process` 被调用（或消息被替换）。可放在新文件 `test/message-pipeline-virtual-tool.spec.ts` 或扩展现有 `message-controller.test.ts`。
3. **ChatVfsSnapshotService**：实现 `persistChatFileSaveWithPreSnapshot(path, content)`（需 `ContentCodec` — 与构造处一致，可用现有 `this.codec`）；单测：给定初始 snapshot + path，调用后 `chatVfsSnapshots` 增 1、`chatVfsSnapshot` 内容更新，且 manifest 对应该 path 的保存前内容。
4. **VfsMainScreen**：`handleEditorSaveRequested` 分支：`isTemplateScope` → 保持 `applySnapshotMutation`；否则 → 新服务方法，然后 `savedContent` / `isDirty` / `historyMachine` 与现有一致；`refreshAllViews()` 仍调用。
5. **模板**：删除手动快照 UI 与函数。
6. **EditorScreen**：删除 aside 与 `rollbackOptions` / `rollbackSnapshotId` 等；若 props 删减导致 `embedToolbar: true` 分支不完整，可同步删模板内冗余按钮或保留最小保存（按仓库实际引用情况收尾）。
7. **Header**：`editorRollbackSnapshotId` ref；`watch([editorHistoryRecords, mode], ...)` 在列表变化时清空非法选中；`select` `data-testid="editor-snapshot-select"`、`button data-testid="editor-history-rollback-submit"` **保留**以便测试改查 header。
8. **文档字符串**：`virtual-tool-message-handler.ts` 顶部可补一句「UPDATED 与 EDITED 同属编辑类事件」。

---

## 测试策略

### 测试用例

1. **管道**：`MESSAGE_UPDATED` + 合法 args / mock `getContext().chat` → `handler.process` 调用 1 次（或与 EDITED 相同断言）。
2. **管道负例**：`MESSAGE_DELETED` 仍不调用 handler（回归）。
3. **快照服务**：单次 `updateChat` 后快照条数 +1、文件内容等于新 `content`；`snapshotMaxCount` 下 FIFO（可复用现有 `chat-vfs-snapshot-service.spec.ts` 风格）。
4. **UI（`vfs-ui-cr-loop.spec.ts`）**：
   - 原 `editor-history-rollback-list` 在 `EditorScreen` 内 **不存在** → 改为断言 **`editor-snapshot-select`** 在 **header** 存在（mount 后进入 editor 模式）。
   - `hides history ... template mode`：模板下仍无快照控件；chat 下有 select。
5. **（可选）E2E**：若已有 `virtual-tool-cr-fixes.spec.ts` 覆盖 handler，可追加「UPDATED kind」路径的单元测试即可，无需浏览器 E2E。

---

## 风险与回滚方案

| 风险 | 缓解 |
|------|------|
| ST 在 UPDATED 时 `record.mes` 滞后 | 单测模拟双形状；必要时后续迭代为 UPDATED 优先读 `args[1]` |
| 单事务保存 API 与 `VfsCore.writeFile` 选项不一致 | 与现 `applySnapshotMutation` 使用相同 `writeFile` 选项（`updatedBy` 等）对齐 |
| UI 测试依赖旧 DOM | 按上表更新 `data-testid` 与查找路径 |

**回滚**：Git revert 本迭代提交；无持久化 schema 变更（`kind` 仍用 `manual`）。

---

## 评审结论（已定案）

- 虚拟工具：**管道层接纳 `MESSAGE_UPDATED`** 为本次 bug 修复核心。
- 保存快照：**单事务** 写入 `chatVfsSnapshot` + `chatVfsSnapshots`；去掉独立「保存快照」入口。
- UI：**快照下拉 + 回滚** 放在 `VfsMainScreen` 预览 header 与预览/保存按钮同一行；`EditorScreen` 不再承载历史侧栏。

---

**文档路径**：`docs/Iterations/VFS-Editor-Save-Snapshot-VirtualTool-And-Rollback-UI/spec.md`

请确认本 `spec.md` 是否可作为实现依据；确认后再进入编码阶段。
