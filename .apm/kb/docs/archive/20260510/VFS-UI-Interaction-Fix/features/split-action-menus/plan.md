# split-action-menus 设计方案

## 设计目标

- 将 Header 与 Row 的动作入口拆分，消除对“选择态”的不必要绑定。
- Header 负责“全局创建”，Row 负责“条目动作”，信息架构清晰。
- 保持样式一致、移动端可用、并补关键回归测试。

## 总体方案

### 1) Header 菜单：全局创建

- 调整现有 `VfsActionMenu`（Header 位置使用的那个）：
  - 保留 toggle（图标按钮）
  - 菜单内容仅保留 global actions：`create-directory`、`create-file`
  - 不再因为 entity 为空而 `disabled`

实现要点：
- 通过 props/模式区分 `VfsActionMenu` 用途：
  - `mode="global-create"`：只渲染创建项
  - `mode="entity-actions"`：只渲染条目动作

### 2) Row 菜单：条目动作

- 在 `VfsFileManagerPanel` 的列表每行右侧新增一个 kebab icon 按钮（建议 `fa-ellipsis`）。
- 点击该按钮：
  - `emit` 一个 `rowActionMenuRequested(path)`（或直接 `entityActionMenuRequested(entity)`）
  - 在 `VfsMainScreen` 将 `selectedPath` 更新为该条目（满足 AC-3）
  - 打开该条目的动作菜单

菜单承载方式（推荐）：
- 复用 `VfsActionMenu` 组件作为“条目菜单”渲染器，但以“受控打开/关闭”的方式放在行内或浮层中：
  - Row 端仅显示按钮 + 容器
  - 菜单项仍使用现有 `data-action` 与 `actionSelected` 事件，复用既有动作触发逻辑

### 3) 关闭/交互细节

- 点击 Row 菜单项后自动关闭菜单。
- 点击其它区域关闭 Row 菜单（可通过 `details` 原生行为或受控状态实现）。
- 移动端热区：
  - 行末按钮最小 28x28（与现有 icon button 基线一致）
  - 保持文件名区域 `text-overflow: ellipsis`

### 4) 样式与无障碍

- Header toggle 与 Row kebab 按钮均使用统一样式基线（优先复用现有 `menu_button`/VFS scoped 样式）。
- 所有 icon button 必须带：
  - `title`
  - `aria-label`

## 变更点清单（预期）

- `src/app/components/business-components/VfsActionMenu.vue`
  - 支持 `mode`（或等价配置）以区分“Header 创建菜单”与“Row 条目菜单”
  - 菜单内容过滤：global vs entity actions

- `src/app/components/business-components/VfsFileManagerPanel.vue`
  - 列表行新增 kebab 按钮
  - 新增事件：请求打开某条目的菜单（并传递 entity/path）

- `src/app/screens/business-screens/VfsMainScreen.vue`
  - 接收“Row 菜单请求”事件
  - 更新 `selectedPath`
  - 将 action 事件路由到现有 `handleEntityAction`

- `test/`
  - 更新/新增回归测试覆盖 AC-1~AC-3

## 测试策略

### 测试用例（最小集合）

- **TC-1 Header 创建菜单不依赖选择态**
  - entity 为空时 Header menu 可打开，包含“新建目录/新建文件”

- **TC-2 Row 菜单存在且可打开**
  - 列表中任意一行存在 kebab 按钮，点击后菜单可见

- **TC-3 自动选中**
  - 点击某行 kebab 后，该行变为选中态（可通过 `data-selected` 或选中样式断言）

- **TC-4 动作仍可触发**
  - Row 菜单点击“编辑/查看”等能正确触发既有 action emit（至少覆盖 1 个文件动作 + 1 个目录动作）

## 风险与回滚方案

- **风险**：Row 内嵌菜单可能影响列表滚动与点击命中（尤其移动端）。
  - 缓解：优先使用 `details/summary` 原生弹出与闭合；必要时将菜单渲染为 overlay（absolute + z-index）。
- **回滚**：
  - 先保留现有 Header “更多操作”完整行为作为回滚点；若 Row 方案不稳定，可仅上线 Header “创建-only”，Row 菜单延后。
