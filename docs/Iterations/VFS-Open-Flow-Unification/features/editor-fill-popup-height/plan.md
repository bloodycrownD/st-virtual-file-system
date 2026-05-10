# editor-fill-popup-height 设计方案

## 设计目标

- 修复编辑区高度异常收缩问题，使 `textarea` 占满弹窗内可用编辑空间。
- 保持不可手动 resize。
- 仅做布局/CSS 修复，不改交互逻辑。

## 总体方案

### 根因（更正）

之前的 plan 把根因归结为“组件边界/EditorScreen 约束不稳定”，这是**不完整**的。

本次问题的真实根因是：**`VfsTabShellScreen` 没有建立占满高度的 flex 链路**（`vfs-tab-shell` / `vfs-tab-content` 缺少 `display:flex`、`flex:1`、`min-height:0`），导致下游即使 `preview stack -> editor stage -> editor screen -> textarea` 都是 flex，也拿不到可分配高度，最终 `textarea` 退化为内容高度（出现 ~53px 这种收缩态）。

### 现状链路（修正后）

基于代码探索，弹窗/预览阶段的高度链路应为：

- `#st-vfs-popup` 与 `#st-vfs-popup-app` 在 `st-vfs-dialog.css` 中已具备 `display:flex`、`flex:1`、`min-height:0`。
- `VfsTabShellScreen.vue` 必须让 `.vfs-tab-shell` 与 `.vfs-tab-content` **占满**上游高度（`flex:1` + `min-height:0`），否则下游会被“卡死”。
- `VfsMainScreen.vue` 中 `vfs-preview-stack` / `vfs-preview-body` / `vfs-editor-stage` 作为中游承接剩余高度。
- `EditorScreen.vue` 中 `vfs-editor-screen` 与 `textarea.vfs-editor` 作为末游实际填充并滚动。

### 方案（更正）

本次采用“上游链路补齐 + 局部兜底 + 副作用修正”的方案：

1. **补齐 `VfsTabShellScreen` 的高度链路**（核心修复）：让 tab shell 与 tab content 占满弹窗 app 的剩余高度。
2. 在 `VfsMainScreen` editor 分支保留 `.vfs-editor-stage`，作为稳定的中间承接层（防止组件根节点在不同主题下被压缩）。
3. `EditorScreen` 保持 `flex/min-height/overflow/resize:none`，并在需要时保留 `height/max-height` 作为主题 reset 兜底（优先不依赖它单独解决问题）。
4. **修复副作用**：高度链路稳定后，文件列表 `.vfs-fm-list`（CSS grid）可能把行拉伸填满容器，需显式 `align-content: start` 防止“每行变大卡片”。
5. 测试覆盖“链路存在 + 不可 resize + 副作用不回归”。

## 最终项目结构

```text
docs/Iterations/VFS-Open-Flow-Unification/features/editor-fill-popup-height/
  spec.md
  plan.md

src/app/screens/business-screens/
  VfsMainScreen.vue

src/app/screens/pure-screens/
  EditorScreen.vue
  VfsTabShellScreen.vue

test/
  vfs-ui-cr-loop.spec.ts
```

## 变更点清单

| 文件 | 变更点 |
|---|---|
| `VfsTabShellScreen.vue` | **核心修复**：为 `.vfs-tab-shell` / `.vfs-tab-content` 建立 `display:flex; flex:1; min-height:0;` 的占满链路，让下游 editor 获得可分配高度。 |
| `VfsMainScreen.vue` | 在 editor 渲染分支引入显式容器（建议 `.vfs-editor-stage`），并给该容器 `flex:1; min-height:0; min-width:0;`，防止组件边界导致高度丢失。 |
| `EditorScreen.vue` | 保持 `flex/min-height/overflow/resize:none`，必要时补 `height/max-height` 作为主题 reset 兜底（不把它当主根因修复）。 |
| `src/styles/st-vfs-dialog.css` | 仅在必要时补充防御样式（避免外层主题覆写造成子树高度收缩），默认不扩大改动面。 |
| `VfsFileManagerPanel.vue` | 修复副作用：`.vfs-fm-list` 增加 `align-content: start`，避免高度链路稳定后 grid 自动拉伸行高。 |
| `test/vfs-ui-cr-loop.spec.ts` | 增加或调整断言：编辑区不再收缩为过矮高度、`resize:none`、桌面/移动一致。 |

## 兼容性说明

- 不改 `mode` 切换逻辑，不改保存/回滚/未保存流程。
- 不改 row 菜单、打开动作、目录/文件交互。
- 仅修改布局样式，不涉及持久化与数据结构。

## 详细实现步骤

1. **补齐 TabShell 高度链路（必须先做）**
   - `VfsTabShellScreen.vue`：
     - `.vfs-tab-shell`：`display:flex; flex-direction:column; flex:1 1 auto; min-height:0; min-width:0;`
     - `.vfs-tab-content`：`display:flex; flex-direction:column; flex:1 1 auto; min-height:0; min-width:0;`
   - 目标：让 `VfsMainScreen`（slot 内容）在 files tab 内获得可分配高度。

2. **在 editor 分支保留显式 stage 容器**
   - `VfsMainScreen.vue`：在 `<EditorScreen ... />` 外包 `.vfs-editor-stage`，并确保其 `flex:1` + `min-height:0`。
   - 目标：在主题/组件边界条件下仍能稳定承接高度。

3. **EditorScreen 兜底约束（不作为主修复）**
   - `EditorScreen.vue`：
     - `vfs-editor-screen`：保持 `flex/min-height:0`；仅当存在主题 reset 时再加 `height/max-height` 兜底。
     - `textarea.vfs-editor`：保持 `flex:1`、`min-height:0`、`overflow:auto`、`resize:none`。

4. **修复文件列表副作用**
   - `VfsFileManagerPanel.vue`：
     - `.vfs-fm-list`（grid）补 `align-content: start`，防止行被拉伸填满容器。

5. **最小范围样式冲突兜底（可选）**
   - 若上述两步仍不足，再在 `st-vfs-dialog.css` 加窄作用域兜底（仅 `#st-vfs-popup` 内 editor 链路）。
   - 保证 reader/slideshow 分支不受影响，避免全局 textarea 污染。

6. **更新测试**
   - 在编辑态断言 `resize=none`。
   - 增加“编辑区高度不收缩”的行为断言：
     - 断言 `textarea.style.height` 为空（不依赖行内高度）
     - 断言 `resize:none`
     - 断言 editor stage / editor screen 具备 `flex` 链路关键 class 与渲染存在
     - 增加列表回归断言：列表行不会被拉伸为大卡片（可通过 row 的 `getBoundingClientRect().height` 上限或 CSS class/属性侧断言实现，避免硬编码像素）
   - 桌面与移动各验证一次。

5. **执行验证**
   - `npm run build`
   - `npm run test:run`

## 测试策略

### 测试用例

- **TC-1 编辑区占满**
  - 进入 editor 模式后，`textarea` 不应处于明显收缩态，且位于 `.vfs-editor-stage -> .vfs-editor-screen` 的占满链路中。

- **TC-2 不可手动 resize**
  - `window.getComputedStyle(textarea).resize === 'none'`。

- **TC-3 桌面/移动一致**
  - 在两种断点下进入 editor，均满足 TC-1/TC-2。

- **TC-4 回归验证**
  - 原有保存、返回、未保存对话框相关测试保持通过。

- **TC-5 模板场景回归**
  - 在 `scope=template` 下进入 editor，确认高度链路同样成立（与 chat 对齐）。

- **TC-6 列表不被拉伸**
  - list 模式下 `.vfs-fm-list` 的 grid 行不应被拉伸填满容器（避免“列表变两块大卡片”）。

## 风险与回滚方案

- **风险**：某层容器若缺失 `min-height:0`，会导致子项再次被压缩。
  - **缓解**：逐层检查并在注释中说明高度链路意图。
- **风险**：宿主主题对 `textarea` 或组件根节点施加 reset，导致 flex 失效。
  - **缓解**：优先组件内修复，必要时在 `#st-vfs-popup` 作用域下提供兜底样式。
- **风险**：高度链路修复后触发 CSS grid/stretch 副作用影响列表可读性。
  - **缓解**：`.vfs-fm-list` 显式 `align-content:start`，并增加回归断言。
- **风险**：测试对像素值过于敏感导致脆弱。
  - **缓解**：使用语义断言（占满链路 + 样式属性）替代硬编码像素。

- **回滚方案**：
  - 回滚本次 feature 提交即可恢复；不涉及数据迁移与业务状态变更。
