# VFS 样式与移动端排版 技术规格（SPEC）

## 设计目标

- 在 **不改动 VFS 业务语义** 的前提下，消除 VFS 弹窗与扩展设置区在窄视口下由布局引起的 **主路径横向滚动**。
- **长文件名/长标签** 在列表与编辑器顶栏使用 **单行省略**（`ellipsis`），并保证 flex 子项可收缩（`min-width: 0`）。
- **编辑器窄屏信息架构**：标题行与主要操作按钮行分离；**Tab 条 + 检查点回滚区** 允许两行折行且 **左对齐**（与 PRD 一致）。
- **扩展设置**（`#st-vfs-settings-root` / `App.vue`）在可控范围内与弹窗 **视觉语言对齐**，并修正与检查点模型不一致的文案（当前仍为「快照保留条数」）。

## 总体方案

### 1) 横向溢出的主要根因（代码已确认）

| 位置 | 现状 | 风险 |
| --- | --- | --- |
| `VfsTabShellScreen.vue` `.vfs-tabs__primary` | `overflow-x: auto` + `white-space: nowrap` | Tab 区优先横向滚动，违背 PRD「左对齐、可两行、不要横向滚动」 |
| `VfsTabShellScreen.vue` `.vfs-tabs__trailing` | `margin-left: auto` | 与 `primary` 同一行竞争宽度；窄屏时挤压 Tab 或触发横向滚动 |
| `VfsFileManagerPanel.vue` `.vfs-fm-action-group` | `overflow-x: auto` + `flex-wrap: nowrap` + `max-width: 55%` | 头部操作区出现横向滚动条（用户截图中的灰条来源之一） |
| `VfsMainScreen.vue` `.vfs-preview-top-bar` | `flex-wrap: wrap` 但 **返回 / 标题 / 操作钮** 仍可能在同一逻辑行竞争宽度；`.vfs-preview-chrome-actions` 使用 `margin-left: auto` | 窄屏下「标题 + 按钮」同排时，即使标题有 ellipsis，整行仍可能溢出或观感不符合 PRD |
| `#st-vfs-popup ... button`（`st-vfs-dialog.css`） | 全局 `white-space: nowrap` | 合理（避免竖排字），但 **容器级** 必须允许换行/折行，不能把「整行工具条」锁死在单行 |
| `App.vue`（设置页） | 依赖宿主 `inline-drawer` 样式；`vfs-number-input` 等仅 `scoped` 局部 | 与弹窗「细边框 + 半透明底」不一致；文案仍写「快照」 |

### 2) 布局策略（推荐）

- **断点**：与 `VfsMainScreen.vue` 已有 `layoutMode`（`innerWidth >= 1024` 为 `desktop`，否则 `mobile`）**语义对齐**，避免同一屏出现两套矛盾断点。
  - **Tab 壳层**（`VfsTabShellScreen.vue`）：使用 **CSS 容器查询或 `max-width: 1023px` 媒体查询** 与上述语义一致（不依赖 `VfsMainScreen` 的 `data-layout`，因模板管理弹窗也可能挂载 `VfsTabShellScreen`）。
  - **编辑器顶栏**（`VfsMainScreen.vue`）：使用 **`[data-layout="mobile"]` 作用域**（已由 `:data-layout="layoutMode"` 输出）增加窄屏专用规则，避免影响桌面宽屏排布。
- **Tab + trailing**：
  - 窄屏：`.vfs-tabs` 改为 **纵向堆叠** 或 **允许整行换行**：`primary` 与 `trailing` 各占 **100% 宽**，`align-items: stretch` / `justify-content: flex-start`。
  - 移除 `.vfs-tabs__primary` 的 **`overflow-x: auto`**（或仅在 `desktop` 保留；默认建议 **彻底移除**，用 `flex-wrap: wrap` 解决）。
  - `.vfs-tabs__trailing` 在窄屏去掉 **`margin-left: auto`**，改为左对齐；内部 `editor-snapshot-tools` 使用 `min-width: 0`，列表框宽度由 **`max-width: 100%` + `flex: 1 1 auto`** 约束，避免固定 `11rem` 在极窄屏顶破布局。
- **编辑器顶栏（mobile）**：
  - `.vfs-preview-top-bar`：`flex-direction: column; align-items: stretch; gap` 保持紧凑。
  - 第 1 行：仅 **返回**（左对齐）。
  - 第 2 行：**标题**（`min-width: 0`，沿用 `.vfs-preview-file-title` 的 ellipsis）。
  - 第 3 行：**`.vfs-preview-chrome-actions`** 独占一行，`justify-content: flex-start`，`flex-wrap: wrap`，并移除该上下文下的 `margin-left: auto`。
- **文件管理头部**：窄屏下 `.vfs-fm-action-group` 取消 `overflow-x: auto`，改为 **`flex-wrap: wrap`**，并放宽 `max-width: 55%`（改为 `min-width: 0; flex: 0 1 auto` 或 `max-width: 100%`），避免横向滚动条。

### 3) 设置页风格对齐

- **文案**：`App.vue` 中「快照保留条数」改为与产品一致的 **「检查点保留条数」**（底层字段仍为 `snapshotMaxCount`，不改持久化键名，避免迁移成本）。
- **样式落点**（二选一，SPEC 推荐 A）：
  - **A（推荐）**：在 `src/styles/st-vfs-entry.css` 增加 **`#st-vfs-settings-root` 前缀** 的规则块，复用弹窗同款 token：`var(--SmartThemeBodyColor, …)`、`rgba(255,255,255,0.12)` 边框、`rgba(0,0,0,0.14~0.2)` 控件底等；`App.vue` 去掉与弹窗冲突的零散样式或改为最小布局间距。
  - **B**：新建 `src/styles/st-vfs-settings.css` 并在 `main.ts` 侧 **`import`**（注意打包进 `dist/index.js`）；规则仍必须带 `#st-vfs-settings-root` 前缀以防泄漏宿主。

## 最终项目结构

不引入新包；可选新增 1 个样式文件（若选方案 B）。Vue 组件保持现有分层：

```
src/
  App.vue                          # 设置页模板 + 轻量布局；文案与 class 钩子
  main.ts                          # 如需则增加 settings 样式 import
  styles/
    st-vfs-dialog.css              # 弹窗内全局约束（谨慎增补：避免破坏菜单/teleport）
    st-vfs-entry.css               # 入口按钮 + 建议增补 settings 视觉块（方案 A）
  app/
    screens/pure-screens/VfsTabShellScreen.vue   # Tab/trailing 窄屏布局
    screens/business-screens/VfsMainScreen.vue   # 编辑器顶栏 mobile 布局 + listbox 宽约束
    components/business-components/VfsFileManagerPanel.vue  # header 行动态换行
```

## 变更点清单

| 文件 | 变更类型 | 说明 |
| --- | --- | --- |
| `VfsTabShellScreen.vue` | 布局/CSS | 窄屏：Tab 可折行、去掉 tab 区横向滚动、trailing 左对齐全宽 |
| `VfsMainScreen.vue` | 布局/CSS | `data-layout="mobile"` 下顶栏三段式；调整 `.vfs-tabs-editor-snapshot-tools` / `.vfs-tabs-snapshot-listbox` 宽度策略 |
| `VfsFileManagerPanel.vue` | 布局/CSS | 窄屏：header 行动组换行、去掉横向滚动 |
| `App.vue` | 文案 + class | 「检查点保留条数」；必要时增加与 `st-vfs-entry.css` 对应的 BEM/class |
| `st-vfs-entry.css` 或新建 settings css | 样式 | `#st-vfs-settings-root` 下 checkbox、number input、`menu_button` 与弹窗对齐 |
| `st-vfs-dialog.css` | 可选 | 若发现 `dialog` 在极窄屏 `80vw` 仍溢出，补充 `max-width: min(960px, 100vw - …)`；**仅在验证后最小改动**（`useVfsPopupLifecycle.ts` 内联样式与 CSS 优先级需核对） |

**非目标（本迭代不改）**

- 不改 `vfsPersistenceStore` schema、不改检查点算法。
- 不强制所有宿主主题下设置页 100% 像素一致（PRD 已约束为扩展可控 DOM）。

## 详细实现步骤

1. **基线验证**：在浏览器 DevTools 设 `390×844`、`480×800`，分别打开 **文件列表**、**编辑器**、**执行与回滚**，记录触发横向滚动的 DOM（验证上述根因表格）。
2. **`VfsTabShellScreen.vue`**
   - 增加 `@media (max-width: 1023px)`（或与 PRD 对齐的 `640px`，但需说明与 `layoutMode` 差异；**默认取 1023 与 `layoutMode` 一致**）。
   - `.vfs-tabs`：窄屏 `flex-direction: column; align-items: stretch`。
   - `.vfs-tabs__primary`：去掉 `overflow-x: auto`；`flex-wrap: wrap`；`white-space` 由 **子按钮** 维持 nowrap 即可。
   - `.vfs-tabs__trailing`：窄屏 `margin-left: 0; width: 100%; justify-content: flex-start`。
3. **`VfsMainScreen.vue`**
   - 在 `scoped` 样式中追加 `[data-layout="mobile"] .vfs-preview-top-bar { flex-direction: column; align-items: stretch; }`。
   - 窄屏下 `.vfs-preview-chrome-actions { margin-left: 0; width: 100%; justify-content: flex-start; }`。
   - 窄屏下 `.vfs-tabs-snapshot-listbox`：改为 `width: 100%; max-width: 100%; min-width: 0;`（去掉强制 `11rem` 三件套或仅 desktop 保留固定宽）。
4. **`VfsFileManagerPanel.vue`**
   - `@media (max-width: 1023px)`：`.vfs-fm-action-group` 允许 `flex-wrap: wrap`，`overflow-x: visible`（或 `hidden`），`max-width: 100%`。
   - 复核 `.vfs-fm-name`：已具备 ellipsis；确认 `.vfs-fm-row` 未设置 `min-width` 导致 grid/flex 溢出（现状看已 `min-width:0` 链较完整）。
5. **设置页**
   - `App.vue` 更新中文标签。
   - `st-vfs-entry.css`：为 `#st-vfs-settings-root .vfs-number-input`、`checkbox_label`、`menu_button` 增加与弹窗一致的边框/圆角/背景（**选择器必须带 `#st-vfs-settings-root`**）。
6. **（可选）弹窗宽度**：若步骤 1 确认 `dialog.style.width = '80vw'` 在极小屏仍溢出，优先在 `useVfsPopupLifecycle.ts` 改为 `min(960px, calc(100vw - 24px))` 之类；改动需手动验证 Teleport 菜单不被裁剪。

## 测试策略

### 自动化

- 现有 **Vitest + Vue Test Utils** 以 **行为/结构** 为主；纯 CSS 布局默认 **不强制** 做像素断言。
- 若需加测：在 `tests/vfs-ui-contracts.spec.ts`（或同类）对 `VfsTabShellScreen` / `VfsMainScreen` 挂载后断言 **关键类名或 `data-layout` 属性** 仍存在（防回归），**不**断言 `getBoundingClientRect`（脆弱）。

### 测试用例（人工验收清单，对应 PRD）

1. **390px / 480px**：文件管理列表长文件名 —— 无横向滚动；省略号可见；行尾菜单与灯泡仍可操作。
2. **390px**：进入编辑器 —— 顶栏为「返回 / 标题 / 按钮」三行（或返回+标题两行 + 按钮行，以最终实现为准，但必须满足 PRD「标题单独一行、按钮单独一行」）；无横向滚动。
3. **390px**：Tab + 检查点工具条 —— 可两行；整体左对齐；**无** Tab 条横向滚动条。
4. **扩展设置**：`#extensions_settings` 中 VFS 配置块与弹窗视觉接近；文案为「检查点保留条数」。
5. **桌面 ≥1280**：文件管理、编辑器、Tab 条布局无异常换行灾难（与现状相当或更好）。

## 风险与回滚方案

| 风险 | 缓解 | 回滚 |
| --- | --- | --- |
| 去掉 Tab 区 `overflow-x: auto` 后，**极多 Tab**（未来）可能纵向过高 | 当前仅 3 个 Tab，可接受；若未来增加 Tab，再评估横向滚动或分组 | 恢复 `auto` 仅在 `desktop` |
| `#st-vfs-popup button { white-space: nowrap }` 与某些新组件冲突 | 新组件用专用容器允许 `flex-wrap` | 缩小全局选择器范围（谨慎） |
| 宿主主题覆盖 `inline-drawer` 导致设置页样式打架 | 选择器带 `#st-vfs-settings-root` 提高特异性；避免 `!important` | 回退新增 CSS，仅保留文案 |

---

**请在开始编码前确认本 `spec.md`：**若你同意断点采用 **`max-width: 1023px` 与现有 `layoutMode` 对齐**，以及对设置页采用 **`st-vfs-entry.css` + `#st-vfs-settings-root` 前缀** 的方案 A，可直接回复「确认」；若希望 Tab 壳层改用 **640px** 断点或设置页采用独立 css 文件（方案 B），请注明偏好以便在实施前微调 SPEC。
