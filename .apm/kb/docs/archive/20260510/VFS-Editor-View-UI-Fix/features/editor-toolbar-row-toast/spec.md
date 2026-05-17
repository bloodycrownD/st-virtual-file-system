# editor-toolbar-row-toast — 规格说明

## 变更动机与原因

在 `VFS-Editor-View-UI-Fix` 落地后，编辑阶段出现以下体验缺口：

1. **工具栏分行**：`VfsMainScreen` 的预览壳顶层仅有「返回」一行，`EditorScreen` 内另有「预览 / 保存」一行，视觉上 **返回与编辑操作不在同一水平行**，与用户期望的 **单行工具栏** 不符（见反馈截图）。
2. **保存无反馈**：成功保存后 **无 toastr 成功提示**；失败路径若未统一弹出 **错误 toast**，用户难以确认是否写入持久化。
3. **编辑区高度行为**：当前源码编辑使用 **`<textarea class="vfs-editor">`**（例：`dialog#st-vfs-popup` → `… > section.vfs-preview-body > section.vfs-editor-screen > textarea.vfs-editor`）。在部分宿主/布局下出现 **行内 `style` 高度随布局变化** 或 **可感知的高度拖拽/拉伸**，用户希望 **编辑区高度由布局约束固定占用剩余空间**，**不允许** 用户通过拖拽把手等方式 **手动改变编辑区高度**；优先通过 **CSS（flex + `min-height: 0` + `overflow: auto` + `resize: none`）** 实现，**不强制** 改为 `contenteditable` div（除非后续无障碍评审要求）。

## 与主需求范围的关系

- **继承**：不改变「全宽预览栈」「未保存三路对话框」「图标化主操作」等已交付行为。
- **本变更**：**编辑器顶栏布局合并为单行**（与 reader/slideshow 顶栏策略协调）、**保存结果的可感知反馈**（成功 + 失败），以及 **编辑区在预览栈内的固定填充高度 / 禁止用户拖拽改高**。

## 影响模块

- `src/app/screens/business-screens/VfsMainScreen.vue`：预览壳顶栏与 `EditorScreen` 的配合方式（避免双行工具栏）。
- `src/app/screens/pure-screens/EditorScreen.vue`：工具栏渲染位置或 props（若将「返回 + 预览 + 保存」收拢到同一 `header`）。
- 保存管线：`handleEditorSaveRequested` 或 `useVfsCommitActions` 失败分支 —— 确保 **用户可见** 的失败提示（`toastr.error` 或已有 `toVfsErrorToast`）。
- **宿主全局**：`toastr.success` / `toastr.error`（与扩展其余处一致）。
- **`EditorScreen.vue` / 预览栈布局**：`.vfs-editor-screen`、`.vfs-preview-body` 等 **flex 列布局** 与 `.vfs-editor` **样式**（含 `resize`）。

## 功能需求

### FR-1 单行工具栏（编辑态）

- 在 **`mode === 'editor'`** 时，**返回**、**预览/源码切换**、**保存**（及保存中状态）处于 **同一水平行**，对齐方式与 VFS 其它工具栏一致（flex、`align-items: center`、合理 `gap`）。
- **`mode === 'reader'`** 与 **`slideshow`**：保持 **顶栏返回** 的现有语义；若当前为「仅返回一行」，**不要求**与编辑器强行同一 DOM 结构，但 **不得** 因本变更破坏布局。

### FR-2 保存成功提示

- 在 **持久化成功**（与现有 `handleEditorSaveRequested` 成功路径一致：快照已写、chat 侧 commit 成功、template 侧写文件成功）后，调用 **`toastr.success`**（或项目内与 SillyTavern 一致的短文案，如「已保存」），避免骚扰可 **单次保存一条**。

### FR-3 保存失败提示

- 任一路径 **保存未成功**（无写盘、commit 失败、`historyMachine` 失败、异常捕获）时，**必须有** **`toastr.error`**（或沿用已有 `toVfsErrorToast`），不得静默失败；与 FR-2 互不替代。

### FR-4 编辑区高度与不可拖拽

- 源码编辑仍为 **`textarea`** 时：须 **`resize: none`**（及浏览器可识别的等价约束），**禁止** 右下角拖拽改变高度。
- 编辑区在 **`vfs-preview-stack` / `vfs-editor-screen` 内** 占满 **工具栏与历史侧栏（若有）之间的剩余纵向空间**，高度由 **父级 flex + `min-height: 0`** 约束，**不依赖** 脚本写入的 **行内 `style="height: …px"`** 作为常规路径（避免随窗口抖动或「像可手动调节」的观感）。超长内容在 **编辑区内滚动**（`overflow: auto`）。
- **不强制** 将 `textarea` 改为 `contenteditable` `div`；若实现上保留 `textarea`，须满足上述交互与滚动语义。

### FR-5 回归

- 未保存对话框、预览切换、保存 testid（`editor-save-submit`）等行为 **不回归**。
- `npm run test:run`、`npm run build` 通过；必要时 **mock `toastr`** 的测试需断言成功/失败调用或跳过宿主（与现有测试风格一致）。

## 验收标准

| AC | 描述 |
|----|------|
| **AC-1** | 编辑态下，返回 + 预览 + 保存 **同一行** 可见，无明显上下错位堆叠。 |
| **AC-2** | 模板 / 聊天场景下成功保存后，出现 **成功 toast**。 |
| **AC-3** | 模拟或触发保存失败时，出现 **错误 toast**（可与现有错误文案一致）。 |
| **AC-4** | 自动化测试全绿；若有 toastr mock，补充或更新断言。 |
| **AC-5** | 编辑态下 `.vfs-editor` **无** 用户可拖拽的 resize 把手；**不** 以行内 `height: …px` 作为常规高度来源（以审查 `EditorScreen` + 预览栈 CSS 为准）；小视口下内容在编辑区内滚动而非撑破弹窗。 |

## 范围外

- 重做历史侧栏、回滚 UX。
- 修改 VfsCore / 快照 schema。
- i18n 词条系统（文案可为固定中文短句）。
- 代码高亮、Monaco 等重型编辑器替换 `textarea`。

## 文档确认

本 spec 与 `plan.md` 供确认后再改代码。
