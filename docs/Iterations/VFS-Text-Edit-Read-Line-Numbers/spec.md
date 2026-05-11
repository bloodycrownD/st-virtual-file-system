# VFS-Text-Edit-Read-Line-Numbers 技术规格（SPEC）

## 设计目标

- 在 VFS 的文本编辑与阅读/预览场景中提供默认开启的行号能力（逻辑行，1..N）。
- 保证行号在内容变化后实时更新，并在滚动时与内容区域同步。
- 在不破坏现有文件管理、编辑保存、历史回滚与渲染链路的前提下完成改造。

## 总体方案

基于现有代码结构（`VfsMainScreen.vue` -> `EditorScreen.vue` / `ReaderScreen.vue` / `SlideshowScreen.vue`），引入一个统一的“行号容器”纯展示组件，用于承载：

1. 左侧行号栏（根据逻辑行计算）。
2. 右侧正文区域（编辑态为 `<textarea>`，阅读/预览态为渲染内容容器）。
3. 同步滚动机制（监听正文滚动并驱动行号栏滚动位置）。

### 关键实现策略

- **编辑模式（源码）**：在 `EditorScreen.vue` 中将现有 `textarea.vfs-editor` 包装为“行号栏 + textarea”双列布局；行号数量按 `model` 的 `\n` 分割结果计算（空文本显示 1 行）。
- **阅读/预览模式（Reader/Slideshow）**：在 `ReaderScreen.vue` 外层增加行号壳层，行号数量基于传入原始文本 `props.html` 的逻辑行计算；滚动同步以 `vfs-reader` 容器为基准。
- **默认始终开启**：不新增配置项，不新增设置开关，满足 PRD。

### 现状约束与边界说明（必须确认）

- 当前 `ReaderScreen.vue` 使用 `renderSafeContent` 输出 HTML，正文是富文本流式布局（标题、段落、列表、代码块），**与逻辑行并非天然一一对应**。
- 因此阅读/预览中的“行号与每个渲染块逐行像素级对齐”不可保证；本方案保证：
  - 行号按逻辑行正确连续；
  - 行号栏与正文容器滚动同步；
  - 视觉上保持稳定、清晰、不过度干扰。
- 若后续要求“预览中逐行严格对齐”，需切换为逐行源码渲染模型（会改变当前 Markdown 展示体验），不在本次范围内。

## 最终项目结构

在现有结构上新增 1 个纯组件，并改造 3 个现有文件：

- 新增：`src/app/components/pure-components/LineNumberGutter.vue`
- 修改：`src/app/screens/pure-screens/EditorScreen.vue`
- 修改：`src/app/screens/pure-screens/ReaderScreen.vue`
- 修改：`src/app/screens/pure-screens/SlideshowScreen.vue`（透传/适配阅读组件结构）
- 修改：`test/vfs-ui-cr-loop.spec.ts`
- 可能新增：`test/vfs-line-numbers.spec.ts`（若现有测试文件过重，拆独立回归用例）

## 变更点清单

### 1) `LineNumberGutter.vue`（新增）

- 输入：
  - `lineCount: number`
  - `scrollTop: number`
- 输出：
  - 渲染 `1..lineCount` 的行号元素列表
  - 通过 `transform` 或容器 `scrollTop` 与正文滚动同步
- 样式要求：
  - 固定宽度（按 3~5 位数预留，例如 48~64px）
  - 右对齐、低对比度、不可选中
  - 与当前 VFS 主题一致（边框/背景弱化）

### 2) `EditorScreen.vue`（改造）

- 将 `<textarea class="vfs-editor">` 放入新的 `.vfs-line-numbered-editor` 布局：
  - 左：`LineNumberGutter`
  - 右：`textarea`
- 增加逻辑行数计算：
  - `lineCount = Math.max(1, model.split('\n').length)`
- 增加滚动同步：
  - 监听 textarea `scroll`，更新 gutter 的 `scrollTop`
- 保持既有行为不变：
  - `v-model`、保存、回滚、preview toggle、toolbar 逻辑不变

### 3) `ReaderScreen.vue`（改造）

- 现有 `<article class="vfs-reader prose" v-html="safeHtml">` 外层增加行号布局壳：
  - 左：`LineNumberGutter`（基于原始文本逻辑行）
  - 右：现有 `vfs-reader` 容器
- 阅读容器统一为可滚动节点（当前已在外层承接滚动，需确保可观察目标稳定）。
- 增加滚动同步：
  - 监听阅读容器滚动 -> 更新 gutter 滚动位置

### 4) `SlideshowScreen.vue`（适配）

- 继续复用 `ReaderScreen`，确保每页内容都自动带行号，无需重复实现。
- 保持分页切换逻辑不变，仅验证页切换后行号会按页面内容刷新。

### 5) `VfsMainScreen.vue`（最小兼容）

- 原则上无需业务逻辑改动；仅在必要时补充样式边界（如内容框 `min-width: 0`、overflow 约束）以防新 gutter 导致横向溢出。

## 详细实现步骤

1. 新增 `LineNumberGutter.vue`，实现可复用 gutter 与基础样式。
2. 改造 `EditorScreen.vue`，接入 gutter、行数计算与滚动同步。
3. 改造 `ReaderScreen.vue`，接入 gutter、行数计算与滚动同步。
4. 适配 `SlideshowScreen.vue`（如需要仅补样式/结构兼容）。
5. 扩展测试（优先 `vfs-ui-cr-loop.spec.ts`，必要时新增 `vfs-line-numbers.spec.ts`）。
6. 运行测试与构建，验证无回归后提交。

## 测试策略

- **单组件行为测试**：验证行号数量计算、空文本边界、长文本性能边界（至少 500+ 行）。
- **集成交互测试**：在 `VfsMainScreen` 场景下验证编辑/预览切换与行号持续存在。
- **回归测试**：确保既有保存、回滚、预览切换、slideshow 翻页不受影响。

### 测试用例

1. 编辑模式初次打开 `# a\nb\nc`，显示行号 `1,2,3`。
2. 编辑模式追加换行后，行号即时从 `N` 变 `N+1`。
3. 编辑区滚动后，行号栏同步滚动（`scrollTop` 一致或同向偏移一致）。
4. 预览/阅读模式显示逻辑行号，且数量与同文本编辑态一致。
5. 预览/阅读滚动时，行号栏滚动同步，无卡顿与明显错位。
6. Slideshow 切换到不同页时，行号数量按新页文本刷新。
7. 元数据显示逻辑（编辑源码隐藏、预览显示）与现有行为保持一致。
8. 保存/回滚后重新渲染，行号连续正确，无重复/跳号。

## 风险与回滚方案

### 风险

- `ReaderScreen` 为 HTML 富文本渲染，逻辑行号与视觉块行高存在天然偏差，可能被感知为“未逐行对齐”。
- 大文本下行号节点数量增加，可能带来轻微渲染成本。
- 新布局可能影响窄屏下可读宽度。

### 风险缓解

- gutter 使用轻量 DOM 与简单样式，避免复杂计算。
- 保持现有 typography 与框体样式，仅新增左侧窄栏，减少视觉扰动。
- 在测试中覆盖窄屏/短高场景，确保不引入横向溢出。

### 回滚方案

- 回滚顺序：
  1. 回退 `EditorScreen.vue` 与 `ReaderScreen.vue` 布局改造；
  2. 删除 `LineNumberGutter.vue`；
  3. 回退相关测试更新。
- 回滚后系统恢复到当前“无行号”稳定状态，不影响存储与业务数据。
