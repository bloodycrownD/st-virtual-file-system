# VFS-Editor-View-UI-Fix 设计方案

## 设计目标

- **FR-1 / FR-2**：编辑工具栏与 VFS 现有暗色控件一致；Preview / Source 切换与 Save **纯图标** + 中文 `title` / `aria-label`；保存进行中不依赖英文长文案作主视觉。
- **FR-3**：`reader` / `editor` /（最小范围下）`slideshow` 在 **desktop 与 mobile 共用同一套全宽栈布局**，移除预览阶段的 `vfs-desktop-grid` 分栏与第二份文件管理器。
- **FR-4**：预览阶段顶栏提供 **统一位置的图标「返回列表」**，`ReaderScreen` 无内嵌条时由父级壳提供。
- **FR-5**：从编辑态 **返回列表**、**切换 Tab**、**关闭弹窗**（若适用）等路径上，当 `editor && isDirty` 时弹出 **保存 / 放弃更改 / 取消** 三路对话框；保存走现有异步管线，失败留在编辑态。

## 总体方案

### 布局（FR-3）

- 在 `VfsMainScreen.vue` 中：**列表阶段** 仍为 `isListStage` → `vfs-list-only-layout` + 单个 `VfsFileManagerPanel`（不变）。
- **预览阶段**（`isPreviewStage`，即 `mode !== 'list'`）：**删除** `layoutMode === 'desktop' && isPreviewStage` 的 `vfs-desktop-grid` 分支；改为 **唯一** 全宽栈（结构与当前 `vfs-mobile-stack` / `vfs-mobile-content` 一致，可将 class 重命名为中性名如 `vfs-preview-stack` / `vfs-preview-body`，避免「仅移动」歧义）。
- 预览阶段 **不再** 挂载第二份 `VfsFileManagerPanel`；用户回列表后通过原列表面板导航。

### 预览顶栏与退出（FR-4）

- 在预览壳顶部放置 **单行工具区**：左侧 **图标返回列表**（`requestModeChange('list')` 经统一「离开编辑」网关，见下文），右侧预留给子内容（或留空；**Editor 自带** Preview/Save 时顶栏仅左侧返回，避免重复 Save）。
- `ReaderScreen` / `SlideshowScreen` 仍无内部返回条时，**完全依赖**该顶栏。

### 未保存三路确认（FR-5）

- 新增轻量对话框组件（建议 `VfsUnsavedEditorDialog.vue`，模式与 `VfsCreateEntityModal.vue` 一致：`open` + `menu_button` + `role="dialog"` + `aria-modal`）。
- 按钮：**保存**、**放弃更改**、**取消**（Escape → 取消）。
- **保存**：`emit('save')` → 父组件调用现有 `handleEditorSaveRequested()`；**成功**后执行待处理的「导航」（如 `mode = 'list'`、允许关弹窗、允许切 Tab）；**失败**则 `toast` + **不**关闭对话框、**不**切换模式（与 spec 风险一致）。
- **放弃**：`discardEditorDraft()` + 执行待处理导航。
- **取消**：关闭对话框，清除待处理导航。

将以下入口 **统一** 经 `requestNavigateFromEditor(target)`（命名可调整）或等价状态机：

| 入口 | 现状 | 目标 |
|------|------|------|
| 顶栏返回 | `requestModeChange('list')` 内 `window.confirm` 二选一 | 若 `editor && dirty` → 打开三路对话框；否则直接 `mode = 'list'` |
| Tab `guardTabChange` | 英文 `confirm` + discard | 同上对话框；取消则 `return false` |
| `VFS_POPUP_BEFORE_CLOSE`（chat） | 英文 `confirm` | 同上；**确认保存**则异步保存成功后 `preventDefault` 解除并关闭（或让宿主关窗） |
| **template scope** | 监听器未挂 `handlePopupBeforeClose` | 在 `onMounted` 中为 **template 同样注册** `VFS_POPUP_BEFORE_CLOSE`（若宿主对该弹窗派发事件），行为与 chat 一致 |

`requestModeChange` 建议拆分为：**同步路径**（无 dirty 或非 editor）与 **异步/对话框路径**（editor + dirty），避免在对话框未决时重复打开。

### 编辑器工具栏（FR-1 / FR-2）

- `EditorScreen.vue`：`header.vfs-editor-toolbar` 内按钮改为 **`menu_button` + 图标 `<i class="fa-solid …">`**（或与 `VfsFileManagerPanel` 的 `vfs-fm-icon-button` 视觉对齐的 class 组合），**禁止**裸 `<button>` 依赖宿主默认样式。
- 建议图标（可与产品微调）：预览 `fa-eye`，源码 `fa-code` 或 `fa-file-lines`，保存 `fa-floppy-disk` 或 `fa-check`；保存中：`aria-busy="true"`、按钮 `disabled` 或附加 `fa-spinner fa-spin`（仅一处主视觉）。
- 保留 `data-testid="editor-save-submit"`（或文档化迁移为 `editor-save` 并更新测试）。
- **历史侧栏**内 Rollback 仍为英文 loading 文案时，若与 spec「主操作图标化」冲突范围有限，可 **本轮仅** 统一主工具栏；Rollback 按钮可顺带改为图标 + 中文 `title`（可选，列入变更点清单为 Minor）。

### 幻灯片（spec 风险）

- 预览壳统一后，`slideshow` 与 reader/editor **共用同一顶栏返回**；不重做幻灯片内部交互。

## 最终项目结构

```text
src/app/
  components/business-components/
    VfsUnsavedEditorDialog.vue    # 新增（或等价命名）
  screens/
    business-screens/
      VfsMainScreen.vue           # 布局合并、顶栏、离开网关、弹窗状态
    pure-screens/
      EditorScreen.vue            # 工具栏样式与图标
docs/Iterations/VFS-Editor-View-UI-Fix/
  spec.md
  plan.md
test/
  *.spec.ts                     # 更新断言（布局 testid、返回、对话框若可测）
```

可选：若 `VfsMainScreen` 模板过长，可抽 **`VfsPreviewStageLayout.vue`**（顶栏 slot + 默认 slot），本 plan **不强制**；第一步以内联为主，第二步再抽离。

## 变更点清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `VfsMainScreen.vue` | 修改 | 移除 desktop 预览 grid；预览单栈；顶栏返回；`requestModeChange` / `guardTabChange` / `handlePopupBeforeClose` 接入三路对话框；template 注册 beforeClose（若事件存在） |
| `VfsUnsavedEditorDialog.vue` | 新增 | 三路按钮 + 无障碍 + 与 create modal 一致的 overlay 样式类（可复用 `vfs-create-modal` 的 CSS 变量或共享片段） |
| `EditorScreen.vue` | 修改 | 图标工具栏、scoped 样式、保存态 |
| `st-vfs-dialog.css` 或组件 scoped | 视需要 | 若 unsaved 与 create 共用 overlay 类名，提取 `--` 或共享 `vfs-modal__overlay`（仅当重复明显时） |
| `test/vfs-ui-cr-loop.spec.ts` 等 | 修改 | 断言不再依赖 desktop 预览 `vfs-desktop-grid`；`vfs-mobile-back` 或新 testid；可选对话框测试 |

## 详细实现步骤

1. **新增 `VfsUnsavedEditorDialog.vue`**  
   - Props：`open: boolean`  
   - Emits：`save: []`、`discard: []`、`cancel: []`  
   - 样式对齐 `VfsCreateEntityModal`（overlay + card + `menu_button`）。

2. **`VfsMainScreen.vue` 状态**  
   - `unsavedDialogOpen`、`pendingLeaveAction`（例如 `{ type: 'mode', next: 'list' } | { type: 'tab', next: 'history' } | { type: 'popup-close' }`）。  
   - 实现 `async function confirmLeaveEditor(): Promise<boolean>`：若 `!isDirty || mode !== 'editor'` 直接 `return true`；否则打开对话框，`Promise` 由对话框 resolve（save/discard/cancel）。

3. **替换 `requestModeChange` 中 dirty 分支**  
   - 当 `mode === 'editor' && isDirty && nextMode !== 'editor'`：不直接 `confirm`；调用 `confirmLeaveEditor()`，根据结果再赋值 `mode`。

4. **顶栏返回**  
   - `@click` → `requestModeChange('list')`（已走新网关）。图标按钮 + `aria-label="返回文件列表"`，`title="返回文件列表"`，`data-testid="vfs-preview-back"`（保留 `vfs-mobile-back` 别名可选，但 plan 推荐单一 testid）。

5. **删除 `vfs-desktop-grid` 分支**  
   - 将原 `v-else` 移动栈提升为 **`v-else-if="isPreviewStage"`**（或 `v-else` 在 `isListStage` 之后），使 desktop/mobile 共用。更新 `isPreviewStage` 上方注释。

6. **`guardTabChange`**  
   - dirty 时打开同一对话框；save 成功后再 `return true`；cancel `return false`。

7. **`handlePopupBeforeClose`**  
   - dirty 时 `preventDefault()`，打开对话框；save 成功后允许关闭（需查阅 `useVfsPopupLifecycle` 是否支持异步再次关闭，或仅 `discard`/`cancel` 路径）；**template** 分支注册同一 listener。

8. **`EditorScreen.vue`**  
   - 工具栏按钮图标化 + class；可选 `scoped` 样式收紧 `.vfs-editor-toolbar` 间距与 flex。

9. **自测与测试**  
   - 全仓库搜索 `vfs-desktop-grid`、`vfs-mobile-back`、`editor-save-submit` 更新测试。  
   - `npm run test:run`、`npm run build`。

## 测试策略

### 测试用例

| ID | 场景 | 期望 |
|----|------|------|
| TC-1 | Mount `VfsMainScreen`（desktop 宽度），`mode=editor`，无 grid | 不存在 `data-testid="vfs-desktop-grid"`（或预览区无 `aside.vfs-sidebar`） |
| TC-2 | 同上，`mode=reader` | 存在 `vfs-preview-back`（或约定 testid），可触发回 `list` |
| TC-3 | `editor` + 改内容 + 点击返回 | 出现三路对话框（可用 `aria-label` 或按钮文案查询）；点取消仍 `mode=editor` |
| TC-4 | 三路对话框点「放弃」 | `mode=list`，内容与 `savedContent` 一致（未写入磁盘可由 mock store 断言） |
| TC-5 | `EditorScreen` 保存按钮 | 仍为 `editor-save-submit`，点击仍 emit `saveRequested` |
| TC-6 | 回归 | `npm run test:run`、`npm run build` 通过 |

**说明**：Vitest 中对 `window.confirm` 的测试需改为对 **新对话框** 的 `wrapper.get(...).trigger('click')`；若异步保存难以 mock，TC-4 可优先覆盖「放弃」与「取消」，「保存」以集成/手工为辅。

## 风险与回滚方案

| 风险 | 缓解 |
|------|------|
| 弹窗关闭与 `preventDefault` 异步竞态 | 先读 `useVfsPopupLifecycle.ts` 契约；保存成功后再派发关闭或二次调用宿主 API |
| `handleEditorSaveRequested` 失败 | 对话框不关闭、`isDirty` 保持，依赖现有 `historyMachine` / toast |
| 预览阶段无侧栏，用户习惯改变 | 与 spec 一致；可在 plan 交付说明中备注「预览阶段仅顶栏返回」 |
| 测试大量依赖旧布局 | 批量更新 testid 与分支条件 |

**回滚**：单分支 revert `VfsMainScreen` + 新增对话框 + `EditorScreen`；无数据迁移。

---

**文档路径**：`docs/Iterations/VFS-Editor-View-UI-Fix/plan.md`  

编码前请确认本 `plan.md`；若需调整（例如暂不处理 template 弹窗 beforeClose），请直接说明后再实现。
