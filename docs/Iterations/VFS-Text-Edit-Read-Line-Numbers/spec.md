# VFS-Text-Edit-Read-Line-Numbers 技术规格（SPEC）

## 设计目标

- 在 VFS **源码编辑**场景提供默认开启的逻辑行号（1..N）。
- 行号仅在 `textarea` 旁展示；**预览/阅读/幻灯片**不展示行号，避免与渲染布局语义冲突。
- 视觉目标：贴近 VS Code —— **仅淡色等宽数字，无独立背景条、无强调竖线**。
- 不破坏文件管理、保存、回滚与渲染链路。

## 总体方案

基于 `VfsMainScreen.vue` → `EditorScreen.vue`（源码/预览切换）→ `ReaderScreen.vue`（仅预览与独立阅读）：

1. **行号组件**：`LineNumberGutter.vue` —— 接收 `lineCount`、`scrollTop`，用 `translateY(-scrollTop)` 与滚动源同步。
2. **唯一挂载点（行号）**：仅在 `EditorScreen.vue` 的源码分支中，`LineNumberGutter` + `textarea` 双列布局。
3. **ReaderScreen**：保持单栏 `article.vfs-reader`，**不**包裹 gutter；幻灯片通过 `ReaderScreen` 继承该行为。

### 关键实现策略

- **源码编辑**：`lineCount = Math.max(1, model.split('\n').length)`；监听 `textarea` 的 `scroll` 更新 gutter。
- **编辑内预览**：`previewMode === true` 时仅渲染 `ReaderScreen`，无 gutter。
- **默认无开关**：不设配置项。

### 边界说明

- 逻辑行号只保证与**源码换行**一致；与 Markdown 渲染后的视觉行无关（预览不显示行号，该问题不再暴露给用户）。

## 最终项目结构

- 新增：`src/app/components/pure-components/LineNumberGutter.vue`
- 修改：`src/app/screens/pure-screens/EditorScreen.vue`（仅源码分支含 gutter）
- 不修改：`ReaderScreen.vue` 不承担行号（与历史「阅读侧 gutter」方案不同）
- 测试：`test/vfs-line-numbers.spec.ts`、`test/vfs-ui-cr-loop.spec.ts`（含元数据与保存/回滚场景）

## 变更点清单

### 1) `LineNumberGutter.vue`

- Props：`lineCount`、`scrollTop`。
- 样式：`background: transparent`、`border: none`；`color` 低对比度；`ui-monospace` + `tabular-nums`；窄列宽（约 28px）、右对齐、`padding-right` 与正文留白。

### 2) `EditorScreen.vue`

- `.vfs-line-numbered-editor`：`LineNumberGutter` + `textarea`；仅 `v-if="!previewMode"`。
- 预览分支 `.vfs-editor-preview-pane`：`overflow: auto`，内嵌 `ReaderScreen` 无行号。

### 3) `ReaderScreen.vue` / `SlideshowScreen.vue`

- 无 gutter；行为与常规阅读一致。

### 4) `VfsMainScreen.vue`

- 通常无需为行号单独改动；沿用既有 preview 框体与 flex 约束。

## 详细实现步骤（落地顺序）

1. 实现 `LineNumberGutter.vue`（同步滚动 + VS Code 风格样式）。
2. `EditorScreen.vue` 接入 gutter（仅源码模式）。
3. 确认 `ReaderScreen` 无 gutter；幻灯片回归。
4. 补充/更新 `vfs-line-numbers.spec.ts` 与 `vfs-ui-cr-loop.spec.ts`。
5. `npm run test`、`npm run build`。

## 测试策略

### 测试用例

1. 源码模式：`# a\nb\nc` → 行号 `1,2,3`。
2. 改内容后行号数量更新。
3. `textarea` 滚动 → gutter `translateY` 与 `scrollTop` 一致。
4. `previewMode === true` → 无 `[data-testid="vfs-line-number-gutter"]`。
5. `ReaderScreen` / `SlideshowScreen` 挂载 → 无 gutter。
6. 500+ 逻辑行：行号数量与首尾数字正确。
7. `VfsMainScreen`：预览见元数据且无 gutter；切源码见 gutter且无元数据（与现有产品行为一致）。
8. 保存后回滚 → 源码行号与内容一致。

## 风险与回滚方案

### 风险

- 极大文件下行号 DOM 节点数随行数线性增长（可接受范围内需观察）。

### 回滚

- 移除 `EditorScreen` 中的 gutter 布局并删除 `LineNumberGutter.vue`；恢复测试断言。
