# rename-modal-and-status-icon — 实施方案（代码勘测后）

## 代码现状结论

### A. 原生提示实际位置（均在 `VfsMainScreen.vue`）

- `overwriteCurrentChatWithTemplate()`：`window.confirm(...)`
- `handleEntityAction('delete')`：`window.confirm(...)`
- `handleEntityAction('rename')`：`window.prompt('New name', entity.name)`
- `handleEntityAction('apply-strategy')`：三次 `window.prompt(...)`（head/tail/fill）

这说明“all-native-prompts”不能只改重命名，需要在同文件同动作链路统一替换。

### B. 行尾 action 区实际结构

- 文件行在 `VfsFileManagerPanel.vue`：
  - 行主体按钮：`.vfs-fm-item`
  - 行尾操作容器：`.vfs-fm-row-actions`
  - 三点菜单组件：`VfsActionMenu mode="entity-actions"`
- 状态切换逻辑在 `VfsMainScreen.vue -> handleEntityAction('toggle-status')`：
  - 文件状态来源：`workTree.selectedFiles`
  - 目录状态来源：`workTree.directoryRulesEnabled[path]`

因此状态图标应由父层计算后传给 `VfsFileManagerPanel` 渲染，避免组件内重复读取 store。

## 设计目标

- 用风格化弹窗替换上述原生提示，保持原行为语义（确认/取消/输入）一致。
- 在每个文件/目录行尾（三点前）增加启用/禁用状态图标。
- 桌面/移动一致，且不影响既有 `VfsActionMenu` 稳定性（outside dismiss / single-open / Teleport 定位）。

## 文件级改造方案

### 1) 新增统一动作弹窗组件

建议新增：

- `src/app/components/business-components/VfsActionConfirmDialog.vue`
  - 用于 delete / overwrite 一类确认动作
  - props: `open`, `title`, `message`, `confirmText`, `cancelText`
  - emits: `confirm`, `cancel`
- `src/app/components/business-components/VfsActionInputDialog.vue`
  - 用于 rename 与 apply-strategy 的输入动作
  - props: `open`, `title`, `fields`, `confirmText`, `cancelText`, `errorMessage`
  - emits: `confirm(payload)`, `cancel`

风格复用 `VfsCreateEntityModal.vue` 与 `VfsUnsavedEditorDialog.vue`，保持同一视觉语言。

### 2) `VfsMainScreen.vue` 统一替换原生提示

- 删除并替换 4 处原生调用：
  - `window.confirm`（overwrite / delete）
  - `window.prompt`（rename / apply-strategy）
- 新增动作态 state（建议）：
  - `confirmDialogState`（null | overwrite | delete）
  - `inputDialogState`（null | rename | apply-strategy）
  - `pendingEntityActionContext`（当前目标 entity/path）
- 在对应 action 分支中改为“打开弹窗 + 等待确认/提交”，提交后复用现有 mutation 与 toast 错误映射。

### 3) 状态图标数据流

- 在 `VfsMainScreen.vue` 基于 `vfsPersistenceStore.getState().chat.workTree` 增加状态计算：
  - `resolveEntityEnabled(path, kind): boolean`
- 将 `directoryEntries` 扩展为包含 `enabled`（或 `status`）字段后再传入 `VfsFileManagerPanel`。
- `VfsFileManagerPanel.vue` 扩展 `VfsBrowserEntity` 类型并在 `.vfs-fm-row-actions` 中渲染状态图标（位于三点按钮之前）。

### 4) `VfsFileManagerPanel.vue` UI 变更

- 新增 `.vfs-fm-row-status` 容器（固定宽度，避免图标切换抖动）。
- 图标示例（最终以项目现有风格为准）：
  - enabled: `fa-solid fa-toggle-on`
  - disabled: `fa-solid fa-toggle-off`
- a11y：
  - `title="已启用/已禁用"`
  - `aria-label="状态：已启用/已禁用"`

## 实施步骤

1. 在 `VfsMainScreen.vue` 建立“动作弹窗状态机”并接入 delete/rename/overwrite/apply-strategy。
2. 新增 `VfsActionConfirmDialog.vue` 与 `VfsActionInputDialog.vue`，替换原生提示交互。
3. 抽出并接入 `resolveEntityEnabled`，将状态随 entry 一并下发。
4. 在 `VfsFileManagerPanel.vue` 行尾渲染状态图标并完成样式对齐。
5. 更新测试并执行验证命令。

## 测试计划（落到现有测试文件）

目标文件：`test/vfs-ui-cr-loop.spec.ts`

- `TC-1` 触发 rename，不再调用 `window.prompt`，显示输入弹窗。
- `TC-2` 触发 delete/overwrite，不再调用 `window.confirm`，显示确认弹窗。
- `TC-3` rename 提交成功后列表名称更新；失败走 `toastr.error`。
- `TC-4` 每行渲染状态图标，且 `title`/`aria-label` 正确。
- `TC-5` `toggle-status` 后图标状态同步更新（文件与目录各一例）。
- `TC-6` 行尾新增图标后，三点菜单开关行为不回归（outside dismiss + reopen）。
- `TC-7` `npm run test:run` 与 `npm run build` 通过。

## 风险与规避

- `template` scope 无完整 workTree 语义：计划中默认显示“禁用”图标，并在实现注释明确来源；不扩展 template 策略体系。
- input 弹窗复用过度导致复杂度上升：先覆盖 rename，apply-strategy 以同组件多字段模式落地，避免分散多个小弹窗。
- 行尾空间拥挤：通过固定图标容器宽度 + `gap` 控制，确保不压缩三点命中区。

## 交付物

- `docs/Iterations/VFS-Editor-View-UI-Fix/features/rename-modal-and-status-icon/spec.md`
- `docs/Iterations/VFS-Editor-View-UI-Fix/features/rename-modal-and-status-icon/plan.md`

你确认这个更新版 plan 后，我再进入实现。
