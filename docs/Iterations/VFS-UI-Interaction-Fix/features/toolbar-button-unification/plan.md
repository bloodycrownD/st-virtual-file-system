# toolbar-button-unification 设计方案

## 设计目标

- 将文件管理头部控件统一为图标按钮体系。
- 明确“左导航 / 右动作”分组，提升结构感。
- 在紧凑化的同时保证主题一致与可访问性。

## 总体方案

### 1) 控件语义与图标映射

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

### 3) 样式基线（紧凑 + 一致）

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

- `src/styles/st-vfs-dialog.css`（可选）
  - 弹窗内图标按钮的统一尺寸/对齐兜底

## 详细实现步骤

1. 在 `VfsFileManagerPanel` 重构 header 为左右分组
2. 替换文件管理标签与 Up 为图标按钮（补 title/aria-label）
3. 在 `VfsActionMenu` 将“更多操作”toggle 改图标
4. 统一图标按钮样式（必要时在 popup scoped CSS 兜底）
5. 手工回归 + 构建验证

## 测试策略

### 测试用例

- **TC-1 图标化完成**
  - 文件管理标签/Up/更多操作显示为图标，hover 有中文提示

- **TC-2 分组布局**
  - 左右分组明显，右侧更多操作与左侧导航不混杂

- **TC-3 一致性与紧凑**
  - 按钮尺寸与对齐一致，头部占用空间减少

## 风险与回滚方案

- **风险**：纯图标可能学习成本上升
  - 缓解：`title` 与 `aria-label` 必须完整
- **回滚**：
  - 仅需回滚 `VfsFileManagerPanel`/`VfsActionMenu` 模板与样式改动即可恢复文本按钮

