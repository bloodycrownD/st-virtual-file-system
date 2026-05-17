# styled-create-dialog 设计方案

## 设计目标

- 用 VFS 内部风格化 modal 替代浏览器原生 prompt，实现 ST 风格一致与键盘友好。
- 将“新建目录/新建文件”入口放入“更多操作”，并允许在未选中条目时使用。

## 总体方案

### 1) “更多操作”支持“未选中也可展开”

现状：`VfsActionMenu` 在 `entity=null` 时整体禁用（`data-disabled=true`），导致无法承载“全局动作”（例如新建）。

方案：
- 将 action menu 动作拆分为两类：
  - **Global actions（不依赖选中）**：`create-file` / `create-directory`
  - **Entity actions（依赖选中）**：现有 `view/edit/rename/delete/...`
- “更多操作”触发器采用 icon-only 方案（与后续 toolbar-button-unification 保持一致），并通过 `title/aria-label="更多操作"` 提供可见提示与可访问语义。
- `VfsActionMenu` 的禁用逻辑改为：
  - 当 `globalActions` 非空时，summary 永远可展开
  - entity actions 在 `entity=null` 时不渲染或渲染为 disabled

### 2) 新建 modal（复用组件）

新增一个轻量组件（建议放在 `components/pure-components` 或 `business-components`，依据现有分层习惯）：

- Props：
  - `open: boolean`
  - `kind: 'file' | 'directory'`
- Emits：
  - `confirm(name: string)`
  - `cancel()`
- 行为：
  - `open=true` 时挂载/显示并聚焦输入框
  - Enter 触发 confirm
  - Esc 触发 cancel

modal 容器不使用原生 `<dialog>`（避免与外层 dialog 叠加语义冲突），采用普通 `div` overlay，并在 `#st-vfs-popup` 作用域内用 CSS 控制层级。

### 3) 在 `VfsMainScreen` 里串起新建流程

- 当 `VfsActionMenu` 触发 global action：
  - `create-directory` → 打开 modal(kind='directory')
  - `create-file` → 打开 modal(kind='file')
- `confirm` 时执行 snapshot mutation：
  - directory：`core.mkdir(path, { recursive: true })`
  - file：`core.writeFile(path, '', { createParents: true })`
- 成功后：
  - 关闭 modal
  - 刷新目录列表（必要时 bump `viewRefreshToken`）
  - 选中新建项

### 4) 样式与键盘

- modal 样式：
  - 背景/边框/阴影与 `st-vfs-dialog.css` 一致
  - `z-index` 高于弹窗内容，但低于宿主全局 overlay（尽量）
- 键盘：
  - 自动 focus 输入框
  - Enter=确定；Esc=取消
  - 关闭时恢复焦点到触发按钮（可选优化）

## 最终项目结构

```text
docs/Iterations/VFS-UI-Interaction-Fix/features/styled-create-dialog/
  spec.md
  plan.md

src/app/components/...(new)
  VfsCreateEntityModal.vue

src/app/components/business-components/
  VfsActionMenu.vue                 # 支持 global actions

src/app/screens/business-screens/
  VfsMainScreen.vue                 # modal state + create mutations

src/styles/
  st-vfs-dialog.css                 # 追加 modal overlay 样式（限定在 #st-vfs-popup）
```

## 变更点清单

- `src/app/components/business-components/VfsActionMenu.vue`
  - 支持 global actions（create-file/create-directory）
  - 未选中也可展开（至少显示 global actions）
  - entity actions 保持原有逻辑（选中才可用）

- `src/app/screens/business-screens/VfsMainScreen.vue`
  - 新增 modal state
  - 处理 global action → 打开 modal
  - confirm → 执行 snapshot mutation → 刷新/选中

- 新增 `src/app/components/**/VfsCreateEntityModal.vue`
  - 纯 UI + keyboard handling + emits

- `src/styles/st-vfs-dialog.css`
  - 增加 modal overlay 样式（仅 `#st-vfs-popup` 内）

## 详细实现步骤

1. 新增 `VfsCreateEntityModal.vue`（open/kind/confirm/cancel + Enter/Esc + autofocus）
2. `VfsActionMenu` 增加 global actions 渲染，并放开“未选中可展开”
3. `VfsMainScreen` 串联：global action → open modal → confirm mutation → refresh/select
4. CSS：为 modal overlay 添加 `z-index` 与主题样式（限定作用域）
5. 运行 `npm run build` 与手工回归用例

## 测试策略

### 测试用例

- **TC-1 未选中也能新建**
  - 列表为空/未选中时，展开“更多操作”能看到“新建目录/新建文件”
  - 触发器可为 icon-only；hover title 与 aria-label 为“更多操作”

- **TC-2 新建 modal 风格化**
  - 点击新建不会出现浏览器原生 prompt
  - VFS 弹窗内出现 modal，按钮/字体风格一致

- **TC-3 键盘**
  - modal 打开后输入框自动聚焦
  - Enter 确认创建；Esc 取消关闭

- **TC-4 创建结果**
  - 创建成功后列表出现条目并自动选中
  - 名称为空/冲突时出现可见错误提示

## 风险与回滚方案

- **风险：details/summary 在不同主题下行为不一致**
  - 预案：必要时把 action menu 改为 button + 自绘 popover（不依赖 `<details>`）。
- **回滚**
  - 若 modal 交互出现不可控问题，可暂时回退到 prompt（但此 feature spec 目标即为移除 prompt）。

