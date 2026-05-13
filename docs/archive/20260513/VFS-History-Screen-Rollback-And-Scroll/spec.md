# VFS 历史区：回滚与纵向滚动 技术规格（SPEC）

## 设计目标

- 对齐 PRD：历史 Tab（`vfs-history-screen`）在弹窗固定高度策略下具备**独立纵向滚动**；带 `snapshotId` 的批次行可稳定触发**批次前锚点**回滚，并在失败/过期场景下可判定、可提示。
- 改动以**最小闭环**为主：优先修布局与交互缺口；对「快照已被 FIFO 驱逐」等数据层边界给出明确产品与实现策略，避免「有文案、无按钮、无解释」。

## 总体方案

### 1) 纵向滚动（根因已定位）

宿主样式明确要求弹窗本体不滚动、由子区域承担滚动：

```14:21:d:/Dev/Js/SillyTavern/public/scripts/extensions/third-party/st-virtual-file-system/src/styles/st-vfs-dialog.css
    Popup sizing strategy (per spec):
    - Keep the dialog itself non-scrollable so overlay menus (e.g. "More Actions") don't create a
      surprise dialog scrollbar.
    - Push scrolling down into dedicated content areas (file list / panels) for stability.
  height: 70vh;
  max-height: 85vh;
  overflow: hidden;
```

`#st-vfs-popup-app` 与 `#st-vfs-popup-app > *` 已使用 `flex: 1; min-height: 0`，`VfsTabShellScreen` 的 `.vfs-tab-content` 同样具备 `min-height: 0`。但 `VfsHistoryScreen` 根节点仅为 `display: grid`，**未**参与「flex 子项 + 可收缩 + 内部 scrollport」链条，且日志列表 `ul.vfs-log-list` **无** `overflow-y: auto`，导致日志超出时被父级 `overflow: hidden` 裁切且无滚动条。

**方案**：将 `VfsHistoryScreen` 根布局改为纵向 flex（或 grid 1fr 行），自身 `flex: 1; min-height: 0`，将「状态条 + 提示」固定在顶部，**日志列表区域**单独容器设置 `overflow-y: auto`（必要时 `min-height: 0`），保证滚轮事件在列表内消费。

### 2) 回滚链路（现状与缺口）

**数据语义（与 PRD 一致）**：

- 工具批次成功持久化时，`ChatVfsRuntime.executeBatch` 在同一 `updateChat` 内写入 `chatVfsSnapshot`、`chatVfsSnapshots`（可选 pre-batch manifest）与 `chatVfsLogs`；`batch` 行在存在 manifest 时带 `snapshotId`（见 `chat-vfs-runtime.ts` 与 schema 注释）。
- `ChatVfsSnapshotService.applySnapshotById` 将当前 `chatVfsSnapshot` 导入 `VfsCore`，对 manifest entries 做 `applyManifestEntriesToCore`，再写回 `chatVfsSnapshot` —— 即「对当前树应用批次前切片」，与「批次前锚点」语义一致。

**UI 触发**：

- `VfsHistoryScreen` 调用 `useVfsSnapshotRollback` → `vfsSnapshotService.applySnapshotById`；成功时 `emitVfsEvent(VFS_STATE_REFRESH_REQUIRED)`。
- `VfsMainScreen` 在 `onMounted` 对 chat 范围注册 `window.addEventListener(VFS_STATE_REFRESH_REQUIRED, refreshAllViews)`，`refreshAllViews` → `refreshAuthoritativeState` + `viewRefreshToken`，可同步目录树、编辑器内容与 worktree。

**可能导致「无法回滚」或体感失败的原因**：

| 现象 | 代码依据 | 处理方向 |
|------|-----------|----------|
| 日志仍显示 `snapshot:` 但无「回滚」按钮 | 按钮条件为 `entry.snapshotId && snapshotExists(entry.snapshotId)`，而 `snapshotExists` 仅查 `chatVfsSnapshots`；FIFO 驱逐后日志引用可仍存在 | 有 `snapshotId` 但记录缺失时：展示**禁用**按钮或「快照不可用」说明 + `title`/辅助文案；可选后续：在 `fifoTrim` 或 `mergeIntoChatSnapshots` 时 scrub 日志中已驱逐的 `snapshotId`（较大行为变更，单列可选） |
| 点击后无感知 | `createVfsHistoryStateMachine` 的 `state` 为**普通对象**，`computed(() => machine.state.status)` **非响应式**，状态条易长期显示 `idle` | 将状态机 `state` 包进 `reactive`/`ref`，或把 `status` 暴露为 `ref`，保证 `rollingBack`/失败态可见 |
| 重复点击 | 历史行回滚按钮未绑定 `rollbackInProgress` / 未 `disabled` | 与编辑器工具栏一致：回滚进行中禁用按钮；可与 `VfsMainScreen` 的 `withWriteScopeGuard` 对齐（需通过 emit/provide/inject 或提升到父级，择最小侵入） |
| `applySnapshotById` 失败 | 已 `toastr.error` | 保持；确认错误码映射中文路径（若产品要求） |

**全栈边界说明**：若 `snapshotId` 对应 manifest **已被驱逐**，无额外持久化副本则**无法魔法恢复**批次前树；PRD「全栈」在此处的合理解释是：打通 `applySnapshotById`、刷新与 UI 状态，并对「缺失 manifest」给出确定行为（提示 + 禁用），而非无限保留历史（除非另开需求改存储）。

## 最终项目结构

无新增包或顶层目录需求；主要变更集中在：

```text
docs/archive/20260513/VFS-History-Screen-Rollback-And-Scroll/
  prd.md          # 已存在
  spec.md         # 本文件

src/styles/
  st-vfs-dialog.css              # 仅当需补充 history 专用 class 的注释/极少量选择器时（默认不改）

src/app/screens/business-screens/
  VfsHistoryScreen.vue         # 布局滚动 + 回滚按钮态 + 过期快照 UX

src/app/composables/screens-composables/
  useVfsHistoryStateMachine.ts # 可选：响应式 state（若选择独立修复）

src/app/screens/business-screens/
  VfsMainScreen.vue            # 可选：复用 withWriteScopeGuard / rollbackInProgress 向子组件传递（若采用父级统一防抖）
```

## 变更点清单

| 文件 | 变更类型 | 说明 |
|------|-----------|------|
| `VfsHistoryScreen.vue` | 布局 / 模板 / 样式 | 增加日志区 scrollport；快照缺失时的可见反馈；回滚中禁用与（可选）spinner |
| `useVfsHistoryStateMachine.ts` | 逻辑 | `reactive`/`ref` 包装状态，保证 Tab 内状态条与 Vue 渲染同步 |
| `VfsMainScreen.vue` | 可选 | 将 `rollbackInProgress` 或统一 `handleHistoryRollback` 下放到子组件，避免双轨异步竞态 |
| `st-vfs-dialog.css` | 可选 | 若需全局约束某一 class 的最小高度（一般应避免，优先组件内解决） |

**不在本 SPEC 默认范围内**：扩大 `chatVfsSnapshots` 存储模型、在 `ChatVfsLogEntry` 内嵌完整 manifest、改动 `trimChatVfsLogsByBytes` 与 FIFO 的全局策略（可作为后续迭代单独立项）。

## 详细实现步骤

### 步骤 A — 历史区纵向滚动（必做）

1. 修改 `VfsHistoryScreen.vue` 根容器：在保持现有视觉间距前提下，使用 `display: flex; flex-direction: column; flex: 1; min-height: 0;`（根若被 `#st-vfs-popup-app > *` 拉伸，需吃掉剩余高度）。
2. 将「状态条 + hint」保留在 `flex: 0 0 auto` 区域。
3. 用包裹层包住 `ul.vfs-log-list`（或给 `ul` 直接加类）：`flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden;`（横向按 PRD可选）。
4. 手动验收：在 70vh 弹窗内造 >30 条日志（或缩小视口），确认滚轮在列表区可滚至首尾，且弹窗/dialog 不出现外层纵向滚动条。

### 步骤 B — 状态机响应式 + 回滚中防抖（必做，优先级高）

1. 调整 `createVfsHistoryStateMachine`：使外部读取的 `status` 为响应式（推荐 `reactive(state)` 返回同一引用，或返回 `statusRef`）。
2. 更新 `VfsHistoryScreen`：`statusLabel` 绑定响应式来源；`rollbackLogSnapshot` 开始时置忙、`finally` 保证复位。
3. 回滚按钮 `:disabled="rollingBack"`（或等价）；可选 `fa-spinner` 与 `aria-busy`（与 `VfsMainScreen` 编辑器保存按钮模式一致）。

### 步骤 C — 快照过期 / 缺失的可解释 UX（必做）

1. 当 `entry.snapshotId` 存在且 `!snapshotExists(entry.snapshotId)`：仍渲染一行操作区，使用 **disabled** 按钮或静态文本「快照已过期」，并 `title` 说明与设置项 `snapshotMaxCount` 的关系（简短）。
2. 保证 `useVfsSnapshotRollback` 仅在记录存在时调用（避免无效 toastr 风暴）。

### 步骤 D — 与主屏刷新一致性（验证项，一般无需改代码）

1. 在 chat 弹窗打开 `history` Tab，执行回滚，确认 `VfsMainScreen` 已监听 `VFS_STATE_REFRESH_REQUIRED` 且目录树/编辑器与 store 一致（现有成功路径应已满足）。
2. 若发现模板 scope 下无 `history` Tab，则无需处理（`useVfsPopupLifecycle` 已限制 `tabs`）。

### 步骤 E — 测试与文档（必做）

1. 新增或扩展 Vitest：针对 `ChatVfsSnapshotService.applySnapshotById` 的「存在 / 不存在 snapshotId」断言（若有现成 service 工厂测试夹具则复用）。
2. 可选：组件级测试仅断言 `VfsHistoryScreen` 在 `min-height:0` 父容器下渲染出带 `overflow-y:auto` 的节点（依赖测试栈，若无则用手动清单替代）。

## 测试策略

### 单元测试

- **`ChatVfsSnapshotService.applySnapshotById`**：`SNAPSHOT_NOT_FOUND`；成功路径后 `store.getState().chat.chatVfsSnapshot` 与预期 manifest 应用结果一致（可构造最小 `VfsSnapshot` + 单 path manifest）。
- **`createVfsHistoryStateMachine`**（若改为响应式）：dispatch 序列后 status 字段符合状态图。

### 手动 / E2E 清单（ST 宿主内）

1. 打开 VFS 弹窗 →「执行与回滚」Tab，导入/制造足够多日志，确认**仅日志区滚动**，头部状态条不滚动出视野。
2. 对最新带 `snapshotId` 的批次行点击回滚：文件树与（若打开）编辑器内容与预期一致；`toastr` 无错误。
3. 将扩展设置 `snapshotMaxCount` 调为极小，连续执行多批次使旧 `snapshotId` 被 FIFO 驱逐：对应行显示**不可用**态与说明，无静默无按钮。
4. 回滚进行中快速连点：仅一次有效应用或按钮禁用无重复 `updateChat`（通过行为观察）。

### 测试用例（Given / When / Then）

| ID | Given | When | Then |
|----|--------|------|------|
| SC-1 | 弹窗 70vh、`history` 日志超出列表视区 | 指针在日志区滚轮向下 | 可滚至最后一条完全可见 |
| SC-2 | 同上 | 滚回顶部 | 首条完全可见 |
| RB-1 | `snapshotId` 在 `chatVfsSnapshots` 中存在 | 点击回滚 | `chatVfsSnapshot` 更新且 UI 刷新 |
| RB-2 | `snapshotId` 不在 `chatVfsSnapshots` | 查看该行 | 显示不可用态+说明，无可用回滚主按钮 |
| RB-3 | 回滚请求进行中 | 再次点击 | 不触发第二次 `applySnapshotById`（或等价防抖） |

## 风险与回滚方案

| 风险 | 缓解 | 回滚 |
|------|------|------|
| flex 改动影响 `files`/`worktree` Tab 高度分配 | 仅改 `VfsHistoryScreen` 内部，不碰 `VfsTabShellScreen` | Git revert 单文件 |
| `reactive` 状态机与现有引用方不兼容 | 保持 `dispatch` API 不变，只改内部存储 | revert `useVfsHistoryStateMachine.ts` |
| scrub 日志 `snapshotId`（若做可选增强）可能误删可恢复引用 | 默认 SPEC **不**做 scrub；若做需单测覆盖 FIFO 边界 | 功能开关或独立 PR |

---

**请确认**：若你认可本 `spec.md` 的实现边界与步骤顺序，回复确认后再进入编码；若需将「日志与快照 FIFO 对齐（驱逐时清 `snapshotId`）」纳入本迭代，请说明，我会先更新本 SPEC 再动代码。
