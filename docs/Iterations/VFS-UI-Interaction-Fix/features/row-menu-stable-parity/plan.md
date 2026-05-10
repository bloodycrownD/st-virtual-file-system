# row-menu-stable-parity — 实施方案

## 结论摘要

Header 与 row **已是同一组件** `VfsActionMenu.vue`。不稳定来源是 **`mode === 'entity-actions'` 专有分支**（deferred `document` capture 监听、`fixed` + 锚点、`resize`/`scroll` 重定位），与 **`mode === 'global-create'`（header）的稳定路径**不一致。

本方案：**删除或停用 entity 专有分支**，让 row 使用与 header 相同的下拉布局与相同的 `syncMenuLifecycle` / dismiss 策略。

## 实施步骤

### 1. 收敛 `VfsActionMenu.vue` 生命周期

- 移除 `isEntityActionsMenu` 对以下逻辑的独占分支，使两种 mode 走同一路径：
  - `deferOutsideBind` / `setTimeout(0)` / `queueMicrotask` 分支；
  - `window` `resize`/`scroll` 监听（若仅服务于锚点重算，则一并移除）。
- `outsideDismiss`：与 header 一致，在 `syncMenuLifecycle` 内 **立即** `document.addEventListener('click', …, { capture: true, signal })`（保留 `AbortController` teardown 模式）。
- `onToggleClick` / `@toggle`：`syncMenuLifecycle` 仍须在「程序化 setAttribute(open)」后调用；收敛后避免双重注册或遗漏 teardown——以单一调用路径为准（必要时在注释中写明顺序）。
- **删除** `updateEntityMenuAnchor`、`overlayInlineStyle`，以及模板中 `:class="{ 'vfs-action-menu__list--entity-overlay': isEntityActionsMenu }"` 与 `:style="isEntityActionsMenu ? overlayInlineStyle : undefined"`。

### 2. 收敛样式

- 删除 `.vfs-action-menu__list--entity-overlay` 及其 `--vfs-menu-anchor-*` / `transform` 规则。
- 确认 `scoped` 样式下 row 内 `ul.vfs-action-menu__list` 的 `position: absolute; right: 0; top: calc(100% + 8px)` 在 `vfs-fm-row-actions` 容器内不被裁剪：
  - 若出现裁剪，仅调整 `vfs-fm-row-actions`（或父级）的 `overflow`/`position`，**不**重新引入 fixed 锚点，除非验收变更。

### 3. 面板结构微调（按需）

- 审阅 `VfsFileManagerPanel.vue` 中 `.vfs-fm-row-actions` 的 CSS（`overflow`、`position`、`z-index`），确保下拉与 header 一致地可见且不影响列表滚动体验。

### 4. 测试更新

- `test/vfs-ui-cr-loop.spec.ts`：
  - 保留「多次 open → outside dismiss → 再 open」用例；必要时删除仅适用于 deferred bind 的 `settleActionMenuOutsideBinding` 复杂同步，或简化为 `flushPromises` + `nextTick` 的统一等待。
  - 若有断言依赖 entity overlay 的 inline style / fixed 定位，改为与 header 一致的断言（例如 list 不具备 `--vfs-menu-anchor-top` 等）。
- 全量运行项目测试命令，修复连带失败。

### 5. 手工验证清单（提交前）

- 浏览器：row 三点 AC-1（≥10 次循环）。
- header / row 交替打开关闭。
- 窄视口 / 移动端布局若启用：确认下拉仍可用（与 header 同一标准）。

## 回滚策略

若列表行内绝对定位导致严重裁剪且短时无法仅用 `overflow` 修复，可临时恢复 overlay，但 **必须先** 复制 header 的 dismiss 绑定策略（立即绑定 + AbortController），defer 仅作为最后手段且需手工复现验证。

## 完成定义

- spec 中 AC 全部满足；
- `VfsActionMenu.vue` 中 entity 与 global-create 在「监听注册 / dismiss / teardown」上无分叉；
- 测试绿；必要时更新迭代文档引用（如 `row-menu-position-fix` 中与 overlay 强绑定的叙述可在后续标注 superseded）。
