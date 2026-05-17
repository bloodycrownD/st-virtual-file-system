# VFS-History-Logs-UI-Optimization 设计方案

## 设计目标

- 将 `提交记录` 与 `日志` 两个 Tab 统一到当前 VFS 视觉体系（容器、按钮、层级、间距、状态反馈）。
- 保留核心语义不变（批量回滚、日志刷新、日志分页），允许轻量交互增强（状态展示与可读性）。
- 保证桌面端头部操作区稳定单行，避免错位/挤压导致的可用性下降。

## 总体方案

### 1) 提交记录页（`VfsHistoryScreen` + `VfsCommitTab`）重构为“信息面板 + 操作条 + 列表卡片”

- 维持现有数据流：
  - 提交数据仍来自 `vfsPersistenceStore.chat.chatVfsVersions`（`VfsHistoryScreen.vue`）。
  - 批量回滚仍由 `useVfsBatchRollbackAction` 驱动（`VfsCommitTab.vue`）。
  - 回滚状态事件仍通过 `rollback-status` 往上抛给状态机。
- UI 结构优化：
  - `VfsHistoryScreen.vue` 顶部 `Status: ...` 从裸文本改为统一状态条（badge/pill + 文案）。
  - `VfsCommitTab.vue` 的 header、列表项、空态做统一容器样式，按钮改为 `menu_button` 体系并补充状态类。
  - 列表项按“摘要主行 + 次级信息行 + 选择控件”明确层级，避免现有“普通文本堆叠感”。
- 交互增强（不改核心语义）：
  - 批量回滚按钮的 idle/rolling/success/failed 状态保留，但增加可识别视觉态（颜色/边框/禁用态）。
  - 当无选择时按钮禁用并显示明确 hint（可保持当前文本逻辑，增强视觉表达）。

### 2) 日志页（`VfsLogPanel`）重构为“头部操作区 + 状态区 + 日志列表区 + 分页区”

- 维持现有数据流：
  - `refreshToken` watch 自动刷新行为保持不变。
  - `fetchLogs({ page, pageSize })` 分页流程保持不变。
  - `status` 状态机（idle/refreshing/succeeded/failed）保持不变。
- UI 结构优化：
  - 将当前裸 `header/ul/footer` 升级为有 class 的面板区域，统一边框、背景、内边距、间距。
  - 刷新按钮与分页按钮改为统一按钮样式（可复用 `menu_button`），确保 default/hover/disabled 清晰。
  - `status` 与 `Page x/y` 改为更明显的信息块（badge + 次级文本），而非纯文本拼接。
  - 日志内容区采用滚动容器，长日志自动换行，防止横向撑破布局。
- 交互增强（轻量）：
  - 刷新中时按钮显示忙态文案/图标（不改变现有 `isLoading` 语义）。
  - 空日志时显示统一空态块，而不是空白区域。

### 3) 样式策略与边界

- 样式改动优先放在各自组件 `scoped` 内，避免污染全局。
- 仅在必要时补充 `src/styles/st-vfs-dialog.css` 的 scoped 选择器（`#st-vfs-popup ...`）做统一补丁。
- 遵循当前 VFS 已有风格参数：半透明深色底、轻边框、圆角、低强度阴影、分层文字透明度。

## 最终项目结构

- `src/app/screens/business-screens/VfsHistoryScreen.vue`（状态条结构与样式）
- `src/app/components/business-components/VfsCommitTab.vue`（提交记录主 UI 重构）
- `src/app/components/business-components/VfsLogPanel.vue`（日志面板结构与样式重构）
- `src/styles/st-vfs-dialog.css`（可选：仅补 scoped 统一样式）
- `test/vfs-ui-cr-loop.spec.ts`（更新/补充相关 UI 与状态断言）

## 变更点清单

- **`VfsHistoryScreen.vue`**
  - 将 `Status: {{ statusLabel }}` 文本替换为带 class 的状态条容器。
  - 提交记录区与历史面板区增加可分辨的布局间距。
- **`VfsCommitTab.vue`**
  - Header：统一按钮风格、禁用/进行中态可见化、单行稳定布局。
  - List：每条记录卡片化（轻边框+背景），摘要与元信息层级分离。
  - Empty：统一空态样式。
- **`VfsLogPanel.vue`**
  - 头部结构分区（刷新按钮、状态 badge、页码信息）。
  - 日志列表区卡片化/滚动化，空态与失败态可视化。
  - 分页区按钮样式统一，并明确禁用态。
- **测试**
  - 保留现有行为断言不变（日志自动刷新策略、分页、回滚事件）。
  - 增加样式/结构级断言（关键 class、状态元素、空态元素存在性）。

## 详细实现步骤

1. **提交记录页结构化**
   - 先改 `VfsCommitTab.vue`：不动脚本行为，先重排模板与 class。
   - 增加样式（header、action button、commit item、subline、empty state）。
2. **提交记录状态条统一**
   - 改 `VfsHistoryScreen.vue` 的状态区展示，保持 `statusLabel` 来源不变。
3. **日志页结构化**
   - 改 `VfsLogPanel.vue` 模板分区：header/status/list/pager。
   - 为刷新/分页按钮补统一视觉与 disabled/loading 表达。
4. **局部交互增强**
   - 在不改业务语义前提下优化显示文案与状态可见性（例如 refreshing 时按钮文案）。
5. **测试对齐**
   - 修复受结构变更影响的旧断言。
   - 新增关键验收点断言（视觉结构存在性 + 交互状态可见性）。
6. **验证**
   - 运行 `npm test` 与 `npm run build`，确保无回归。

## 测试策略

### 测试用例

- **提交记录**
  - 批量回滚按钮：未选择禁用、选择后可点击、回滚中禁用且状态可见。
  - 列表排序与事件抛出行为保持不变（已有用例继续通过）。
  - 空态样式节点可识别（例如 `vfs-commit-empty` 仍存在且视觉容器存在）。
- **日志**
  - 默认不自动拉取（切 Tab 不自动 fetch）行为保持不变。
  - refreshToken 驱动的自动刷新行为保持不变（已有 `vfs-ui-cr-loop` 用例）。
  - 刷新中按钮禁用、分页按钮禁用条件正确。
  - 空日志列表时显示空态提示容器。
- **整体**
  - 两个 Tab 的 header 均具备单行稳定 class 与 overflow 降级策略。
  - `npm test` 全量通过、`npm run build` 通过。

## 风险与回滚方案

- **风险1：测试快照/选择器失配**
  - 结构重排会影响基于文本或层级的断言。
  - 方案：优先引入稳定 class / `data-testid`，同步更新断言。
- **风险2：交互增强引入语义偏移**
  - 方案：限制为“状态展示增强”，不改事件触发路径与条件判断。
- **风险3：样式与宿主主题冲突**
  - 方案：仅使用 scoped 样式与低权重透明层，不改全局变量。
- **回滚**
  - 以组件文件为单位回滚：`VfsCommitTab.vue`、`VfsLogPanel.vue`、`VfsHistoryScreen.vue` 可独立撤销；
  - 若出现行为异常，优先保留脚本逻辑回滚模板/样式层改动。

