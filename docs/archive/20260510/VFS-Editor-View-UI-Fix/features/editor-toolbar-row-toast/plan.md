# editor-toolbar-row-toast — 实施方案

## 设计目标

- **一行顶栏**：编辑态下返回与预览/保存 **视觉同一行**。
- **可感知保存结果**：成功 `toastr.success`，失败 `toastr.error`（或现有 error 映射）。
- **编辑区高度**：`textarea.vfs-editor` **填充** 预览栈剩余高度，**内部滚动**；**`resize: none`**，**禁止** 用户拖拽改高；避免依赖 **行内 `height: …px`** 作为常规实现（若存在宿主脚本写入，实现阶段应移除或覆盖）。

## 根因简述

- 当前 **返回** 在 `VfsMainScreen` 的 `.vfs-preview-top-bar`，**预览/保存** 在 `EditorScreen` 的 `.vfs-editor-toolbar`，两个块级 `header` 纵向堆叠 → 两行按钮。

## 推荐实现路径（二选一，优先 A）

### A. 顶栏上收至 `VfsMainScreen`（推荐，单一 flex 行）

1. 将 **`previewMode`**（预览 ↔ 源码）状态 **提升到** `VfsMainScreen`（仅 `mode === 'editor'` 使用），`v-model:preview-mode` 传入 `EditorScreen`。
2. `EditorScreen`：
   - **移除** 独立顶层 `header`（或仅在有 `showEmbeddedToolbar === false` 时不渲染工具栏）。
   - 保留 `textarea` / 内嵌 `ReaderScreen` / `history` 侧栏逻辑；根据 `previewMode` 切换编辑区展示。
3. `VfsMainScreen` 在 `mode === 'editor'` 时，`.vfs-preview-top-bar` 扩展为 **单行 flex**：
   - 左：**返回**（现有）
   - 中右：**预览切换**、**保存**（从 `EditorScreen` 迁出的按钮与图标，事件调用原有 `handleEditorSaveRequested` / 切换 `previewMode`）
4. 为避免逻辑重复，可抽 **`VfsEditorChromeActions.vue`**（纯 UI + emit：`toggle-preview`、`save`），由 `VfsMainScreen` 引用；`EditorScreen` 只关心 `previewMode` prop。

### B. 顶栏下收到 `EditorScreen`（备选）

- `EditorScreen` 的 `header` 内 **第一个子元素为返回**，由父传入 `@exit` 或 `showBack` + `emit('back')`；**父级在 editor 模式不再渲染** `.vfs-preview-top-bar` 中的返回（reader/slideshow 仍在父级保留返回）。
- 缺点：reader 与 editor 顶栏 **DOM 位置不一致**，但实现量可能略小于状态提升。

**计划默认采用 A**，除非实现中发现 `EditorScreen` 可测性大幅下降。

## 样式要点

- `.vfs-preview-top-bar`：`display: flex; align-items: center; flex-wrap: nowrap; gap: 8px;`（或 `justify-content: space-between` + 右侧动作组 `margin-left: auto`）。
- 按钮继续 **`menu_button` + 图标**，与现有 `vfs-preview-back-button` 高度协调。

### 编辑区（`textarea.vfs-editor`）与预览栈

- **`.vfs-editor-screen`**：`display: flex; flex-direction: column; min-height: 0; flex: 1 1 auto;`（或与父级 `.vfs-preview-body` 配合，保证列方向可收缩）。
- **`.vfs-editor`**：`flex: 1 1 auto; min-height: 0; width: 100%; box-sizing: border-box; overflow: auto; resize: none;`；**不设** 固定像素高为主策略，除非与设计 token 冲突。
- **`.vfs-preview-body`**：已含 `flex` 列时，确保 **编辑器子树** `min-height: 0`，避免 flex 子项默认 `min-height: auto` 撑开弹窗。
- **不强制** `contenteditable`；若保留 `textarea`，须满足 spec **FR-4**。

## Toast 实现要点

- 在 **`handleEditorSaveRequested`** 成功末尾（`isDirty` 已清、`historyMachine` SUCCESS 之后）调用 **`toastr.success('已保存')`**（或更短 copy）。
- 在 **已有** `SAVE_FAILED` / `catch` / `!targetPath` / `!ok` 分支，确认 **`toastr.error`** 已调用；若仅 `historyMachine.dispatch` 而无 toast，**补** `toastr.error(toVfsErrorToast(...))`。
- 测试：`beforeEach` 已 mock `toastr.error` 时，增加 **`toastr.success` mock** 并断言成功路径调用次数（可选，避免依赖真实 toastr）。

## 变更点清单

| 文件 | 说明 |
|------|------|
| `VfsMainScreen.vue` | 单行顶栏；可选 `previewMode` ref；挂载 `VfsEditorChromeActions` 或内联按钮；成功/失败 toast；**若需** 微调 `.vfs-preview-body` 使 editor 子树 `min-height: 0` |
| `EditorScreen.vue` | 接收 `previewMode` v-model；条件隐藏自有 toolbar；**scoped** 补充 `.vfs-editor` / `.vfs-editor-screen` 布局与 `resize: none` |
| `VfsEditorChromeActions.vue` | **可选** 新建，收敛预览/保存按钮 |
| `test/vfs-ui-cr-loop.spec.ts` | 调整选择器（若 toolbar DOM 迁移）；toast mock |

## 详细实现步骤

1. 提升 `previewMode` 至 `VfsMainScreen`，`EditorScreen` 改为 props + emit 同步。
2. 将预览/保存按钮 JSX 迁到 `VfsMainScreen` 顶栏（或子组件），与返回同一 `header`。
3. 删除 `EditorScreen` 内重复 `header`（保留 history 等）。
4. `handleEditorSaveRequested`：成功追加 `toastr.success`；失败分支审计并补 `toastr.error`。
5. **编辑区 CSS**：按上文为 `.vfs-editor-screen` / `.vfs-editor` 落地 flex 填充 + `resize: none`；排查并去掉非常规 **行内 height** 来源（若有）。
6. 跑 `npm run test:run` / `npm run build`，修测试。

## 测试策略

### 测试用例

- **TC-1**：Mount 编辑态，`querySelector` 或 wrapper 断言 **仅一个** `.vfs-preview-top-bar`（或等价）内含返回 + 保存按钮，**不存在**第二个独立 `.vfs-editor-toolbar` 行（若类名保留则应为空或不存在）。
- **TC-2**：Mock `toastr.success`，触发保存成功，断言调用。
- **TC-3**：Mock 保存失败路径，断言 `toastr.error` 调用。
- **TC-4**（可选）：Mount 编辑态，断言 `textarea.vfs-editor` 计算样式或属性层面 **`resize`** 为预期（`none`）；或断言 **无** 行内 `style` 含 `height`（若测试环境稳定）。

## 风险与回滚

- **风险**：`previewMode` 提升后 `EditorScreen` 单测（若有）需更新。
- **回滚**：Revert 单提交即可恢复双行布局与无 success toast 行为。

---

编码前请确认本 `plan.md` 与 `spec.md`。
