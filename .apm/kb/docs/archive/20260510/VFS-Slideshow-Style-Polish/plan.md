# VFS Slideshow Style Polish 设计方案

## 设计目标

- 将入口文案 **“幻灯片/阅读模式”** 统一为 **“幻灯片”**。
- 幻灯片模式顶部栏控件与 **编辑器/预览顶部栏** 视觉与布局一致，并且 **单行**呈现：
  - Back（已有）
  - Prev / Next
  - 当前文件名（同一行，溢出省略号 + `title`）
- 移除目录切换 `select` 与 `vertical` 按钮/逻辑。

## 总体方案

### 现状约束（基于代码探索）

- 外层 `VfsMainScreen.vue` 在预览阶段（reader/editor/slideshow）统一渲染 `.vfs-preview-top-bar`，其中已经包含返回按钮（Back）以及 editor 专属按钮（预览/源码 + 保存）。
- `SlideshowScreen.vue` 目前自己渲染 `.vfs-slideshow-toolbar`，包含：
  - 目录切换 `select`
  - Prev / Next 文本按钮
  - Vertical 切换按钮（并驱动 `verticalMode` 改变渲染策略）

### 设计决策

- **把 Prev/Next + 当前文件名 放到 `VfsMainScreen` 的 `.vfs-preview-top-bar` 中**（与 Back 同一行），从而自然对齐 editor/preview 顶栏样式。
- `SlideshowScreen` **去掉内部 toolbar**，只负责渲染“当前页内容”（单页）：
  - 当前页 index 状态由 `VfsMainScreen` 持有并传入
  - Vertical 模式被移除：不再渲染“纵向多页列表”
- 目录切换 `select` 移除后：
  - `VfsMainScreen` 继续使用现有 `slideshowDirectoryPath` 作为目录来源（进入幻灯片时由 row action 设定）
  - `SlideshowScreen` 不再接收 `directories` / `directoryPath` / `directoryChanged`（或保留但不渲染，推荐删除以避免死参数）

## 最终项目结构

- `src/app/components/business-components/VfsActionMenu.vue`
  - 更新 `open-slideshow` 标签文案为“幻灯片”
- `src/app/screens/business-screens/VfsMainScreen.vue`
  - 在 `.vfs-preview-top-bar` 中为 `mode === 'slideshow'` 增加 Prev/Next 按钮与标题区域
  - 新增并维护 `slideshowPageIndex` 状态（ref）
  - 将 `SlideshowScreen` 改为受控组件（传入 index 与 pages）
- `src/app/screens/pure-screens/SlideshowScreen.vue`
  - 移除目录 `select`、vertical 按钮与 `verticalMode`
  - 去掉内部 toolbar，只渲染当前页内容（ReaderScreen）
- `test/vfs-ui-cr-loop.spec.ts`
  - 增加最小回归：动作菜单里 `open-slideshow` 的文案为“幻灯片”（确保 AC1 不回退）

## 变更点清单

1. **入口文案**
   - `VfsActionMenu.vue`：`ACTION_LABELS['open-slideshow']` 从“幻灯片/阅读模式”改为“幻灯片”

2. **顶部栏控件统一（核心）**
   - `VfsMainScreen.vue`：
     - `mode === 'slideshow'` 时，在 `.vfs-preview-top-bar` 渲染：
       - Prev（`menu_button vfs-preview-chrome-button` + icon）
       - Next（同上）
       - 标题（当前页 title）：同一行占剩余宽度，`overflow: hidden; text-overflow: ellipsis; white-space: nowrap;`
     - 控件可用性：
       - 首页 Prev disabled
       - 末页 Next disabled
     - 状态：
       - 新增 `slideshowPageIndex = ref(0)`
       - 当 `slideshowDirectoryPath` 或 `slideshowPages` 发生变化时，将 index 重置为 0（避免越界）

3. **SlideshowScreen 简化为内容渲染**
   - `SlideshowScreen.vue`：
     - props 改为仅需要 `pages` + `pageIndex`（受控）：
       - `pages: SlideshowPage[]`
       - `pageIndex: number`
     - 计算 `currentPage` 并渲染：
       - 空态保持（No readable pages...）
       - 非空态渲染 ReaderScreen 内容
     - 删除：
       - `directories` / `directoryPath` / `directoryChanged`
       - `verticalMode` / vertical 相关模板与样式
       - toolbar 样式与按钮

## 详细实现步骤

1. 修改 `VfsActionMenu.vue` 文案（AC1）。
2. 在 `VfsMainScreen.vue`：
   - 增加 `slideshowPageIndex` 与重置逻辑（watch `slideshowDirectoryPath` / `slideshowPages.length`）。
   - 在 `.vfs-preview-top-bar` 增加 `v-if="mode === 'slideshow'"` 的控件区：
     - Prev/Next 按钮沿用 `menu_button vfs-preview-chrome-button`
     - 标题区域沿用新 class（例如 `.vfs-preview-title`）
   - 更新 `SlideshowScreen` 使用方式，传入 `:pages="slideshowPages"` 与 `:page-index="slideshowPageIndex"`（或 `v-model:page-index`，按组件最终签名定）。
3. 改造 `SlideshowScreen.vue` 为纯渲染组件，移除 select/vertical。
4. 更新/新增测试用例（见下）。
5. 运行 `npm run build` 与 `npm test` 回归。

## 测试策略

- **单元/组件测试**（Vitest）
  - 覆盖 AC1 文案：`VfsActionMenu` 中 `open-slideshow` 渲染文本为“幻灯片”。
- **手动回归**（SillyTavern 内）
  - 进入任意目录 → 触发“幻灯片”
  - 顶部栏单行：Back + Prev + Next + 文件名（省略号）
  - Prev/Next 可翻页；首/末页 disabled
  - 不再出现目录下拉 `select` 与 Vertical 按钮

### 测试用例

1. `open-slideshow` 文案为“幻灯片”。
2. 幻灯片顶部栏按钮与 editor 顶栏一致（仅检查 class/存在性，不做像素级断言）。
3. 翻页边界：第一页 Prev disabled，最后一页 Next disabled（可在后续补充用例，如你希望）。

## 风险与回滚方案

- **风险**：把控件从 `SlideshowScreen` 移到 `VfsMainScreen` 顶部栏后，需要确保不会影响 editor 顶栏的布局（尤其是右侧按钮区域）。
  - **缓解**：仅在 `mode === 'slideshow'` 时渲染该控件，并复用现有按钮 class；标题使用 `min-width:0` + 省略号避免挤爆。
- **回滚**：保留改动集中在三个文件（ActionMenu/MainScreen/SlideshowScreen），若需要回滚可直接恢复这三处提交或通过 git revert 撤销本迭代提交。

