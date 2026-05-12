# VFS-Header-Tabs-WorkTree-UI-Optimization 设计方案

## 设计目标

- 让 **四个 Tab（文件管理 / 提交记录 / 日志 / 工作树）顶部区域**在桌面端保持稳定单行布局，按钮不掉到第二行。
- 将文件管理页的“模板覆盖当前目录”替换为 **仅 icon** 的入口，hover tooltip 为 `覆盖`，点击沿用既有确认流程。
- 重做 Tab 样式，让 Tab 在视觉上与普通按钮明显区分，并具备清晰的 default/hover/active 状态。
- 新增 `工作树` Tab：展示 **当前上下文**下 `VIRTUAL_WORK_TREE` 的 **最终渲染文本（纯文本）**。

## 总体方案

### 1) Tab 扩展与样式重做（`VfsTabShellScreen.vue`）

- 将 Tab 枚举从 `['files','history','logs']` 扩展为 `['files','history','logs','worktree']`，并补齐标签映射。
- Tab 按钮继续沿用宿主 `menu_button` 的基础交互，但在 `VfsTabShellScreen.vue` 内部通过 `.vfs-tabs` / `.vfs-tab` 的 scoped CSS 做“Tab 容器化”：
  - 为 `.vfs-tabs` 增加可识别的 **容器边界/背景层**（轻量半透明 + 圆角 + 内边距）。
  - `.vfs-tab` 作为“胶囊/分段按钮”呈现：hover 有可见背景变化；active 有更明确的边框/背景/字重组合（不只 font-weight）。
  - 保持 `overflow-x: auto`，并确保 `white-space: nowrap`，避免窄宽度下破布局（允许横向滚动作为降级策略）。

### 2) 顶部按钮区单行化（以“各 Tab 的页面头部”为单位完成）

这里的“头部按钮区”指每个 Tab 内容页顶部的 actions/header 行。实现要点一致：

- `display: flex; align-items: center; flex-wrap: nowrap; gap: ...;`
- `min-width: 0` 给可截断文本；按钮组使用 `inline-flex` 并 `white-space: nowrap`。
- 当空间不足时允许 `overflow-x: auto`（降级策略），避免按钮被挤到第二行。

落点：

- **文件管理**：复用 `VfsFileManagerPanel.vue` 的 `header.vfs-fm-header`，让所有 actions 都进入 `#actions` 插槽区域，从结构上保证与 path 行同一行。
- **提交记录**：`VfsCommitTab.vue` 已有 `header.vfs-commit-tab-header`，补齐“单行不换行 + 超出横向滚动”策略即可。
- **日志**：`VfsLogPanel.vue` 的 `header` 当前无 class，补一个面板级 header class 并应用同样 flex 规则。
- **工作树**：新建页面组件并提供一个轻量 header（可留空），主要是内容区域（纯文本）展示。

### 3) “模板覆盖当前目录”替换为 icon（`VfsMainScreen.vue` + 复用 `VfsFileManagerPanel` 头部 actions）

现状：`VfsMainScreen.vue` 在 files tab 顶部单独渲染 `.vfs-chat-actions`，里面是长文案按钮 `模板覆盖当前目录`，这会额外占行并导致布局拥挤/换行。

改造策略：

- 移除 `.vfs-chat-actions` 这条“额外一行”结构。
- 将覆盖入口挪进 `VfsFileManagerPanel` 的 `#actions` 插槽里，与 `VfsActionMenu`（更多操作）同一行。
- UI 形态：使用与 header 图标按钮一致的“方形 icon button”（复用 `vfs-fm-icon-button` 风格或抽一个通用类），内容为 `<i class="fa-solid fa-...">`（最终 icon 在实现时从现有 FA 集合里选一个“覆盖/同步/刷新”语义接近的）。
- Tooltip：使用 `title="覆盖"` 与 `aria-label="覆盖"`。
- 点击：沿用现有 `overwriteCurrentChatWithTemplate()` 与 `confirmDialogState` 流程不变。
- 可用性约束：`template scope` 不显示；`chat scope` 显示（与现状保持一致）。

### 4) 新增 `工作树` Tab（`VfsMainScreen.vue` + 新 screen）

数据来源与渲染：

- `src/domain/work-tree/work-tree-engine.ts` 已提供纯函数 `renderVirtualWorkTree(snapshot, workTree)`，它输出的就是 `{{VIRTUAL_WORK_TREE}}` 对应的最终文本（文件块拼接，带 `<file ...>` 与行号）。
- `VfsMainScreen.vue` 内已有响应式 `currentSnapshot` 与 `currentWorkTree`，可直接 `computed(() => renderVirtualWorkTree(currentSnapshot.value, currentWorkTree.value))` 得到展示文本。

UI 展示：

- 新增 `src/app/screens/pure-screens/WorkTreeScreen.vue`：
  - props：`text: string`
  - 内容区域使用 `pre` 或 `textarea readonly`（优先 `pre`，配合 `white-space: pre-wrap`/`pre` + `overflow` 策略）。
  - 根据 spec 风险项明确策略：默认 **自动换行**（`pre-wrap` + `overflow-wrap: anywhere`），同时保留横向滚动能力作为兜底（例如容器 `overflow: auto`）。
  - 仅展示文本，不展示任何调试信息/规则表单。
- 在 `VfsMainScreen.vue` 的 tab 分发中加入：
  - `slotTab === 'worktree'` 时渲染 `WorkTreeScreen :text="renderedWorkTreeText"`。

## 最终项目结构

- `src/app/screens/pure-screens/VfsTabShellScreen.vue`（扩展 tab + tab 样式重做）
- `src/app/screens/business-screens/VfsMainScreen.vue`（覆盖 icon 挪入 header actions；新增 worktree tab 内容与 computed 文本）
- `src/app/screens/pure-screens/WorkTreeScreen.vue`（新增：纯文本展示）
- `src/app/components/business-components/VfsFileManagerPanel.vue`（必要时补强 header 单行约束/overflow 策略）
- `src/app/components/business-components/VfsCommitTab.vue`（补强 header 单行约束策略）
- `src/app/components/business-components/VfsLogPanel.vue`（header class + 单行约束策略）

## 变更点清单

- `VfsTabShellScreen.vue`
  - 新增 Tab：`worktree`
  - `TAB_LABELS` 增加 `工作树`
  - Tab 样式：容器化、active/hover 强化、与普通按钮区分
- `VfsMainScreen.vue`
  - 删除 `.vfs-chat-actions` 里的长文案按钮
  - 在 `VfsFileManagerPanel` 的 `#actions` 内新增覆盖 icon（仅 chat scope）
  - 增加 `worktree` tab 分支与 `renderedWorkTreeText` computed
- 新增 `WorkTreeScreen.vue`
  - 纯文本呈现 worktree 输出，带合理换行/滚动策略
- `VfsFileManagerPanel.vue` / `VfsCommitTab.vue` / `VfsLogPanel.vue`
  - 统一补齐“桌面端单行”关键 CSS（`flex-wrap: nowrap`、`overflow-x: auto` 等）

## 详细实现步骤

1. **扩展 Tab 枚举与文案**
   - 修改 `VfsTabShellScreen.vue`：加入 `worktree` 与 `TAB_LABELS.worktree = '工作树'`
   - 修改 `VfsMainScreen.vue`：类型 `VfsScreenTab` 加入 `worktree`，默认 `tabs` 加入 `worktree`（仅非 template scope）
2. **Tab 样式重做**
   - 在 `VfsTabShellScreen.vue` 的 scoped CSS 中实现 tabs 容器与 active/hover 状态（不改全局 `menu_button`）
3. **文件管理头部单行化 + 覆盖 icon 迁移**
   - 删除 `VfsMainScreen.vue` 的 `.vfs-chat-actions` 行
   - 在 `VfsFileManagerPanel` 的 `#actions` 插槽里加入覆盖 icon（放在 `VfsActionMenu` 左侧或右侧，最终按视觉密度微调）
   - 确认：root/模板 scope 不出现；点击触发现有确认弹窗流程
4. **新增 WorkTreeScreen 与 worktree tab 渲染**
   - 新建 `WorkTreeScreen.vue`
   - `VfsMainScreen.vue` 计算 `renderedWorkTreeText` 并在 `slotTab === 'worktree'` 渲染
5. **提交记录/日志/工作树顶部单行策略补齐**
   - `VfsCommitTab.vue`：`header` 增加 nowrap/overflow-x
   - `VfsLogPanel.vue`：为 header 添加 class 并加同类规则
   - `WorkTreeScreen.vue`：如有 header 行，同样应用；否则只保障内容滚动

## 测试策略

### 测试用例

基于现有 `test/vfs-ui-cr-loop.spec.ts`（或同类 UI 回归用例）补充：

- **tab 渲染**
  - 默认 tabs 包含 `工作树`
  - 点击 `工作树` tab 后出现 worktree 纯文本容器（用 `data-testid` 固定选择器）
- **覆盖 icon**
  - 在 chat scope + files tab：覆盖入口为 icon，且 `title`/`aria-label` 为 `覆盖`
  - 点击 icon：出现确认弹窗（沿用现有覆盖确认流程断言）
- **单行约束（桌面端）**
  - 在 desktop layout 下，文件管理 header actions 不应导致第二行（在 JSDOM 下用结构性断言：`.vfs-fm-header` 只有一行容器且 actions 在同一 header 内；必要时增加 `data-testid` 标识来避免依赖布局测量）

## 风险与回滚方案

- **工具层面无法可靠测量“是否换行”**：测试以 DOM 结构与关键 CSS class/属性断言为主，避免依赖 layout engine。
- **极窄宽度下单行可能过挤**：采取 `overflow-x: auto` 作为降级策略，不强行压缩到不可点击。
- **样式与宿主主题冲突**：Tab 样式控制在 `VfsTabShellScreen.vue` scoped 内，避免全局污染；active/hover 采用低对比的半透明层与边框。
- **回滚**：所有改动集中在 `VfsTabShellScreen.vue` 与 `VfsMainScreen.vue` 以及新增 `WorkTreeScreen.vue`；如需回滚可恢复原 tabs 与 `.vfs-chat-actions`，并移除 worktree 分支与新增文件。

