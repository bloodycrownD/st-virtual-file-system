# toolbar-button-unification 设计方案

## 设计目标

- 将文件管理面板头部控件统一为图标按钮体系。
- 明确“左导航 / 右动作”分组，提升结构感。
- 在紧凑化的同时保证主题一致与可访问性。
- 与 tab 导航做语义分层：tab 保留文本（多 tab），头部负责图标化快捷操作。

## 总体方案

### 1) 面板头部控件语义与图标映射

- 文件管理标识：`fa-folder-tree`（或 `fa-folder-open`，按现有视觉体系选其一）
- 返回上级：`fa-arrow-up` / `fa-level-up-alt`（语义明确返回）
- 更多操作：`fa-ellipsis` / `fa-ellipsis-vertical`

每个图标按钮保留：
- `title`（中文，如“文件管理”“返回上级”“更多操作”）
- `aria-label`（与 title 一致）

### 2) 分组布局

- `VfsFileManagerPanel` header 拆为：
  - `vfs-fm-nav-group`（左）
  - `vfs-fm-action-group`（右）
- `VfsActionMenu` toggle 维持在右组，但改为图标按钮形态。

### 3) Tab 区域差异化规则

- 多 tab（chat / 完整 VFS）保留文本 tab：`文件管理 / 提交记录 / 日志`。
- 单 tab（template scope）隐藏 tab 头部，避免“只有一个 tab 仍显示标题”的冗余。
- 该行为由 `VfsTabShellScreen` 根据 `tabs.length` 自动控制。

### 4) 样式基线（紧凑 + 一致）

- 统一按钮框尺寸（例如 28x28 或与 `mes_button` 对齐）。
- 使用同一 class 基线（优先 `menu_button` / `mes_button`）+ scoped 细调：
  - padding / border-radius / line-height
  - icon font-size 与垂直对齐
- 在 `#st-vfs-popup` 作用域内兜底，避免污染宿主其他区域。

## 最终项目结构

```text
docs/Iterations/VFS-UI-Interaction-Fix/features/toolbar-button-unification/
  spec.md
  plan.md

src/app/components/business-components/
  VfsFileManagerPanel.vue     # header 分组 + 图标化 Up/label
  VfsActionMenu.vue           # 更多操作 toggle 图标化
src/app/screens/pure-screens/
  VfsTabShellScreen.vue       # 单 tab 隐藏 header；多 tab 保留文本导航

src/styles/st-vfs-dialog.css  # popup 作用域样式兜底（如需要）
```

## 变更点清单

- `src/app/components/business-components/VfsFileManagerPanel.vue`
  - 头部 DOM 分组（nav/action）
  - 文件管理标签改图标标识
  - Up 改图标按钮（保留禁用逻辑）

- `src/app/components/business-components/VfsActionMenu.vue`
  - summary/toggle 改图标显示
  - 保留 details/summary 行为与无障碍标签

- `src/app/screens/pure-screens/VfsTabShellScreen.vue`
  - 单 tab 隐藏 tab header
  - 多 tab 保持文本导航（不做 icon-only）

- `src/styles/st-vfs-dialog.css`（可选）
  - 弹窗内图标按钮的统一尺寸/对齐兜底

## 详细实现步骤

1. 在 `VfsFileManagerPanel` 重构 header 为左右分组
2. 替换文件管理标签与 Up 为图标按钮（补 title/aria-label）
3. 在 `VfsActionMenu` 将“更多操作”toggle 改图标
4. 在 `VfsTabShellScreen` 实现 `tabs.length === 1` 时隐藏 tab header
5. 多 tab 保持文本 tab，不再与面板头部 icon 做同层重复表达
6. 统一图标按钮样式（必要时在 popup scoped CSS 兜底）
7. 手工回归 + 构建验证

## 测试策略

### 测试用例

- **TC-1 图标化完成**
  - 面板头部的文件管理标识/Up/更多操作显示为图标，hover 有中文提示

- **TC-2 分组布局**
  - 左右分组明显，右侧更多操作与左侧导航不混杂

- **TC-3 Tab 差异化**
  - 多 tab 场景显示文本 tab；template 单 tab 场景不显示 tab header

- **TC-4 一致性与紧凑**
  - 按钮尺寸与对齐一致，头部占用空间减少

## 风险与回滚方案

- **风险**：纯图标可能学习成本上升
  - 缓解：`title` 与 `aria-label` 必须完整
- **回滚**：
  - 仅需回滚 `VfsFileManagerPanel`/`VfsActionMenu` 模板与样式改动即可恢复文本按钮

