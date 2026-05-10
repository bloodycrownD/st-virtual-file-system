# row-menu-teleport-ghost-fix — 实施方案

## 根因（摘要）

`entity-actions` 下 **Teleport 的 `<ul>` 未与 `details.open` 绑定生命周期**：关闭时仅 `panelFixedStyle = {}`，节点仍在 DOM 中，CSS 使无坐标面板 **落在 teleport 宿主默认位置**（左上），与打开行的 **fixed** 面板并存。

## 方案（推荐）

### 首选：`v-if="detailsOpen"`（或等价 ref）包裹 Teleport 内面板

- 使用 **`ref` + 显式 `isMenuOpen`**（在 `setAttribute('open')` / `removeAttribute('open')` / `toggle` 回调中同步），或读取 **`detailsRef.open`** 的响应式封装，确保 **仅当打开** 时渲染 Teleport 子树。
- **注意**：`panelRef`、定位与 dismiss 监听均依赖 DOM —— 打开时 **`nextTick` 后再 `updateFixedPanelPosition`**（现有逻辑可保留或微调顺序）。
- **关闭**：卸载 Teleport 内容即无幽灵节点；`teardownMenuInteraction` 仍可清空 style（或省略，因节点已销毁）。

### 备选：`v-show` + `visibility` / `aria-hidden`

- 若需保留 DOM 以复用焦点，可用 **关闭时 `visibility: hidden` + `pointer-events: none`** 并 **不展示在布局中**；一般 **不如 `v-if` 干净**，优先 `v-if`。

### 不建议

- **仅**在关闭时给空对象外加 `opacity:0` 而仍占位 —— 易留可聚焦/可测节点，验收模糊。

## 实施步骤

1. **`VfsActionMenu.vue`**
   - 引入 **`isOpen`**（`ref(false)`），在 **`onToggleClick`**（成功打开分支）、**`outsideDismiss`**、**`triggerAction`/`triggerGlobalAction`**、**`closePeerMenus` 影响本实例时**（若需）与 **`@toggle`** 中同步 `details.open`。
   - 将 Teleport 内 `<ul>` 包在 **`v-if="isEntityActions ? isOpen : true"`** 或与 `!isEntityActions` 时仍走原非-teleport 行为（当前非 entity 也走同一 Teleport 但 `disabled` —— 核对模板：`Teleport :disabled="!isEntityActions"`，非 entity 时 ul 在本地 DOM；entity 时 teleport。**仅 entity 需要 `v-if`**）。
   - 确认 **`syncMenuLifecycle`** 在 **`isOpen` true** 后注册监听；关闭路径 **abort** 不变。
2. **Peer close**：当 `closePeerMenus` 关掉其它 `details` 时，那些实例会通过 **`removeAttribute('open')`** 触发 **`toggle`** —— 确保 **`isOpen` 更新为 false**（依赖 `@toggle` → `onOpenStateChanged` → 若 `!open` 则 `teardownMenuInteraction` + 设 `isOpen = false`）。若当前 **`toggle` 在程序化关闭时未触发**，须在 **`removeAttribute` 后手动同步 `isOpen`**（与既有 jsdom/浏览器差异注释一致）。
3. **测试** `vfs-ui-cr-loop.spec.ts`：`mount` **多行** `VfsFileManagerPanel`，断言 **关闭** 后 **`vfs-entity-action-menu-panel` 数量 0**；打开一行 **数量 1**。
4. **验证**：`npm run test:run`、`npm run build`。

## 与 `row-menu-portal-stable-overlay` 的关系

本 feature **修补**该迭代的实现疏漏；**不修改**其 spec 中的 FR 意图，仅在实现层补 **挂载守卫**。

## 风险

- **`v-if` 与 `panelRef`**：首帧 ref 为空时避免 NPE；定位放在 **`nextTick`** 之后。
- **程序化 `open` 与 `toggle` 事件**：保持与 `row-menu-stable-parity` 以来一致的单向同步策略。

## 完成定义

- AC-1～AC-4 满足；代码审查可指出 `isOpen` 与 `details.open` **单一事实来源**（避免长期漂移）。
