# VFS UI/交互修复 设计方案

## 设计目标

- 将入口按钮从“大号文本按钮”改为 **宿主一致的图标按钮**（`.mes_button` + `fa-folder-tree`），并稳定挂载到 `.extraMesButtons`。
- 修复两类“点击无响应”：
  - 入口点击不打开弹窗
  - 弹窗打开但白板/不可交互（点击不生效）
  
  最终要求：入口点击始终能触发打开弹窗；弹窗内 `Up / 更多操作 / 文件项` 等点击都可用。
- 弹窗/面板样式尽量 **复用 SillyTavern 原生样式**，避免出现 `<dialog>` 默认白底导致的“样式失效”。
- 修复按钮/Tab 文案 **不竖排、不逐字换行**。

## 总体方案

### 1) 入口按钮采用宿主兼容挂载 + 事件委托

参考 `st-better-database` 的 `ExtraMesButtons.vue`：

- 按钮结构使用 `.mes_button` 与 `<i class="fa-solid fa-folder-tree">` 图标。
- 事件绑定使用 **事件委托**（优先 jQuery：`$(document).on('click', selector, handler)`），避免宿主重渲染替换 DOM 后导致事件丢失。
- `mountVfsEntry()` 维持幂等：重复调用不会创建多个按钮；卸载时必须解绑事件并移除按钮。

### 2) 弹窗 `<dialog>` 最小化样式修复（限定作用域）

- `useVfsPopupLifecycle()` 打开弹窗时给 `<dialog>` 设置 class（如 `.st-vfs-popup`）。
- 新增一份全局 CSS（只作用于 `#st-vfs-popup` / `.st-vfs-popup`），用于：
  - 深色背景、文字色
  - `::backdrop` 遮罩
  - z-index/pointer-events 修复点击无响应
  - 复用 ST 按钮类（如 `.menu_button`）时提供必要的兼容兜底

### 2.5) inline drawer（扩展设置页）样式与按钮布局修复

- 覆盖 `#extensions_settings` 内的扩展设置 UI（inline drawer）：
  - 按钮文字不竖排（white-space / writing-mode）
  - 使用 ST 原生 class（例如 `.menu_button` / `.inline-drawer*`）的同时，补齐必要的 scoped 样式，防止“点一下样式失效”

### 3) Tab/按钮文字不竖排

- `VfsTabShellScreen.vue` 的 tab 按钮增加 class，并在 scoped CSS 中约束：
  - `white-space: nowrap; writing-mode: horizontal-tb;`
  - `overflow-x: auto`（容器）或 `flex-wrap: wrap`（二选一，优先横向滚动保持一致性）

### 4) 文件面板与“更多操作”点击无响应

该类问题优先按“**被遮挡/点击穿透**”处理：

- 先用弹窗根样式（z-index/pointer-events/背景）修复整体点击。
- 若仍存在“更多操作”不可点：
  - 将 `VfsActionMenu` 的 `<summary>` 补齐按钮样式与 `cursor/pointer-events`，确保其在宿主 reset 下仍可点击。

## 最终项目结构

新增/调整后关键路径如下：

```text
src/
  app/
    bootstrap/
      mountVfsEntry.ts
    composables/
      screens-composables/
        useVfsEntryMount.ts          # 入口按钮：结构/事件委托
        useVfsPopupLifecycle.ts      # 弹窗：加 class、必要属性
  styles/
    st-vfs-dialog.css               # 仅作用于 #st-vfs-popup 的弹窗样式（新增）
```

> 说明：`src/styles/` 若当前不存在，将创建；CSS 的作用域必须严格限制在 `#st-vfs-popup` 及其后代。

## 变更点清单

### `src/app/composables/screens-composables/useVfsEntryMount.ts`

- 将入口 DOM 从 `button.menu_button` + 文本 `VFS` 改为 `.mes_button` + 图标 `<i class="fa-solid fa-folder-tree"></i>`。
- 事件绑定改为事件委托（优先 jQuery）：
  - `$(document).off('click.vfsEntry', '#st-vfs-entry-button')`
  - `$(document).on('click.vfsEntry', '#st-vfs-entry-button', onOpen)`
- 保留无 jQuery fallback（`document.addEventListener` + `closest()`）作为兼容兜底。

### `src/app/composables/screens-composables/useVfsPopupLifecycle.ts`

- 为 `<dialog id="st-vfs-popup">` 增加 class（`.st-vfs-popup`）与必要属性（如 `aria-label` 保留）。
- 确保弹窗打开后内容区可滚动、可点击（必要时设置 `popup.style` 最小化 inline）。

### `src/main.ts`

- 引入新增的弹窗 CSS（例如 `import '@/styles/st-vfs-dialog.css'`），保证扩展加载时样式已注入。

### `src/App.vue`（inline drawer）

- 确认/修复 inline drawer 内按钮与布局：
  - 避免按钮文字竖排：`white-space: nowrap; writing-mode: horizontal-tb;`
  - 若宿主样式覆盖导致“点一下样式失效”，以 scoped 样式对关键节点（按钮容器/标题栏）进行最小兜底（不改 ST 的结构）

### `src/app/screens/pure-screens/VfsTabShellScreen.vue`

- tab 容器/按钮样式调整，确保文案不竖排：
  - `white-space: nowrap; writing-mode: horizontal-tb;`
  - 容器支持横向滚动（`overflow-x: auto;`）或合理换行（`flex-wrap`）。

### `src/app/components/business-components/VfsActionMenu.vue`（若需要）

- 强化 `<summary>` 的可点击性与视觉（cursor/padding/按钮类），避免宿主 CSS reset 造成不可点击/不可见。

## 详细实现步骤

1. **入口按钮改造**
   - 改 `useVfsEntryMount.ts` 的 DOM 结构与事件绑定方式（事件委托 + 幂等）。
   - 验证：按钮出现于 `.extraMesButtons` 且尺寸与其他图标按钮一致。

2. **弹窗样式兜底**
   - `useVfsPopupLifecycle.ts` 给 dialog 添加 class。
   - 新增 `src/styles/st-vfs-dialog.css`，限定作用域并修复白底、z-index、pointer-events。
   - `main.ts` 引入该 CSS。

3. **inline drawer（扩展设置页）按钮/样式修复**
  - 修改 `App.vue` 的 scoped CSS，确保按钮不竖排，且与宿主 inline drawer 行为一致。

4. **Tab/按钮文案不竖排**
  - 修改 `VfsTabShellScreen.vue` 的 CSS，保证横向排字。

5. **交互回归**
   - 打开弹窗后测试 `Up / 文件项选择 / 双击目录 / 更多操作菜单`。
   - 若仍出现“完全没反应”，优先从 `z-index/pointer-events` 与 overlay 遮挡继续调整。

## 测试策略

以手工回归为主（宿主环境耦合 ST UI），辅以最小的单元验证（仅对纯函数/字符串处理模块，非本次重点）。

### 测试用例

- **TC-1 入口按钮外观**
  - 进入任意 chat：`.extraMesButtons` 存在 VFS 图标按钮（`fa-folder-tree`）。
  - 无大号文本 “VFS” 按钮。

- **TC-2 入口按钮可用性**
  - 连续点击 10 次：每次均打开弹窗（或已打开则保持打开，不出现异常）。
  - 切换 chat/角色后重复点击：仍可打开。

- **TC-3 弹窗交互**
  - 打开弹窗后：点击 `Up` 在非根目录时返回上级；根目录时禁用。
  - 单击文件项出现选中态；双击目录进入目录。
  - 点击“更多操作”展开菜单；点击任一动作可触发（至少能进入确认框/模式切换）。

- **TC-4 样式与布局**
  - 弹窗不白底、文字可读。
  - Tab 按钮文案不竖排；窄宽下仍可操作（可横向滚动或换行但不逐字竖排）。

## 风险与回滚方案

- **风险：宿主 DOM 频繁替换导致按钮消失**
  - 缓解：事件委托 + `mountVfsEntryButton()` 可重复调用的幂等 mount。
  - 回滚：保留旧按钮创建逻辑分支（在 commit 历史中可回退）。

- **风险：全局 CSS 污染宿主样式**
  - 缓解：CSS 作用域严格限定在 `#st-vfs-popup` / `.st-vfs-popup`。
  - 回滚：移除 `src/styles/st-vfs-dialog.css` 引入并恢复默认 dialog 行为。

