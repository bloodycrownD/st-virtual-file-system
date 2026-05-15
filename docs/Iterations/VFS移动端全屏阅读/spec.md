# VFS 移动端全屏阅读 技术规格（SPEC）

## 设计目标

- 对齐 PRD：在**文件预览栈**内用 **Fullscreen API** 扩大可读区域；全屏目标为**预览壳内区块**，**不是**整块 `#st-vfs-popup-app` 或 `<dialog>` 根节点。
- 全屏态保留与现有一致的 **Pre/Next**、**编辑器**下的 **预览/源码** 与 **保存**；**返回**在全屏下语义为**先退出浏览器全屏**（见下文与 PRD「退出全屏」一致）。
- 失败路径可感知，不破坏非全屏布局。

## 现状与约束（代码事实）

- **预览 DOM**（`VfsMainScreen.vue`）：
  - `div.vfs-preview-stack`（`data-testid="vfs-preview-stack"`）
  - 其下 `section.vfs-preview-body` 包含：
    - `header.vfs-preview-top-bar`：返回、`viewer-file-title`、`vfs-preview-chrome-actions`（预览切换、保存、Prev、Next）
    - `section.vfs-preview-content-frame`：Reader / Editor / Slideshow + 条件 `footer.vfs-preview-meta`
- **弹窗挂载**（`useVfsPopupLifecycle.ts`）：`<dialog#st-vfs-popup>` 内顺序为 `header`（标题+关闭）→ `#st-vfs-popup-app`（Vue 根）→ action-menu teleport 宿主。PRD 要求全屏**不包含**整块 `#st-vfs-popup-app`，即全屏后**不应**把宿主 dialog 头部/关闭条带进 FullscreenElement（除非后续产品改口）。
- **Pre/Next**：`goToPrevSlideshowPage` / `goToNextSlideshowPage`，禁用条件为 `canGoPrevSlideshowPage` / `canGoNextSlideshowPage`（与 `viewerIndex`、`viewerFilePaths` 绑定）。单文件目录下通常 `length === 1`，双键禁用——全屏必须**复用同一套** computed/函数，禁止复制分页逻辑。
- **返回（非全屏）**：`restoreViewerOriginOrFallbackToList` 会 `requestModeChange('list')` 等，与「仅退出全屏」不同。
- **未保存**：`requestVfsPopupClose` 等路径已有守卫；全屏关闭弹窗前须 `exitFullscreen`，避免残留系统全屏层（见风险）。

## 总体方案

### 全屏作用节点（已定）

对 **`section.vfs-preview-body`** 调用 `requestFullscreen()`（及其 `webkit`/`moz` 前缀回退，按环境探测）。

**理由**：该节点同时包含**顶栏工具条**与**内容框**，满足 PRD「全屏内仍要 Pre/Next、编辑器的预览/保存」；且相对 `#st-vfs-popup-app` 更窄，不包含 `VfsTabShellScreen` 的「文件管理 / 历史 / 工作树」标签带与列表区，符合「仅预览内容区」。

### 交互：返回键双层语义

- **`document.fullscreenElement === previewBodyEl`（或为其后代）** 时：点击现有「返回」按钮 → **仅** `document.exitFullscreen()`（及前缀等价），**不**调用 `restoreViewerOriginOrFallbackToList`。
- **非全屏**时：保持现有 `restoreViewerOriginOrFallbackToList` 行为。

（可选文案：全屏时 `title`/`aria-label` 改为「退出全屏」，避免与「返回目录」混淆；实现时二选一，推荐改文案。）

### 全屏入口

在 `vfs-preview-chrome-actions` 内新增按钮（建议 Font Awesome `fa-expand` / `fa-compress` 或项目已有图标集），`data-testid="vfs-preview-fullscreen-toggle"`：

- 非全屏：点击 → `previewBodyRef.requestFullscreen()`（用户手势内）。
- 已全屏：点击 → `exitFullscreen()`（与「返回」等价时可二选一，但至少一条路径明显）。

### 状态与生命周期

- `onMounted` 注册 `document` 的 `fullscreenchange`（及 `webkitfullscreenchange` 若需）同步本地 `isPreviewFullscreen` ref，用于图标切换与「返回」分支。
- `onBeforeUnmount`：若当前 `document.fullscreenElement` 为预览 body 或其子节点，调用 `exitFullscreen()`，避免卸载后全屏元素悬空。
- **`useVfsPopupLifecycle` `disposePopup`**：在 `popupApp.unmount()` **之前**尝试 `exitFullscreen()`（若 fullscreen 节点在弹窗内），作为双保险（可在 lifecycle 内 `querySelector` 检测或导出弱耦合钩子；优先在 `VfsMainScreen` `onBeforeUnmount` 处理，lifecycle 仅作 best-effort 若易实现）。

### 失败与降级

- `requestFullscreen` 返回 Promise：`.catch` → `toastr.error`（或项目统一 toast），错误信息简短。
- 若 `document.documentElement.requestFullscreen` 不存在且元素上亦无前缀方法：按钮 `disabled` + `title` 说明「当前环境不支持全屏」。

### 样式

- 全屏下 `section.vfs-preview-body` 建议增加 class（如 `vfs-preview-body--fullscreen`）由 `fullscreenchange` 驱动：`min-height: 100vh`（或 `100dvh`）、`box-sizing: border-box`、背景色与弹窗内一致，避免透明底透出浏览器灰底。
- `vfs-preview-content-frame` 在 full viewport 下继续 `flex: 1` + `min-height: 0`，保证编辑器/阅读区吃满剩余高度。

## 最终项目结构

```
src/
  app/
    composables/
      screens-composables/
        useVfsPopupLifecycle.ts     # 可选：unmount 前 exitFullscreen 兜底
        useVfsPreviewFullscreen.ts   # 新建：request/exit、前缀、事件订阅（推荐）
    screens/
      business-screens/
        VfsMainScreen.vue            # ref、按钮、返回分支、fullscreen class、样式
tests/
  vfs-preview-fullscreen.test.ts     # 新建：mock Fullscreen API + 行为单测（或与 vfs-ui-cr-loop 合并小节）
```

若全屏逻辑极短，可内联在 `VfsMainScreen.vue`；超过 ~40 行则抽 `useVfsPreviewFullscreen.ts` 保持可读。

## 变更点清单

| 文件 | 变更 |
|------|------|
| `VfsMainScreen.vue` | `ref` 绑定 `section.vfs-preview-body`；全屏按钮；`restoreViewerOriginOrFallbackToList` 包装或内联分支；`fullscreenchange`；全屏样式 class；可选 editor-only 隐藏保存（若与 PRD 5 对齐现有顶栏） |
| `useVfsPreviewFullscreen.ts`（新建） | `enter`/`exit`/`isActive`、前缀检测、订阅清理 |
| `useVfsPopupLifecycle.ts`（可选） | `disposePopup` 内 `exitFullscreen` 兜底 |
| `vfs-ui-cr-loop.spec.ts` 或新测试文件 | 按钮存在、全屏分支 mock、退出后状态 |

## 详细实现步骤

1. **新建 composable**（或组件内首版）：封装 `getFullscreenElement()`、`requestFullscreenOn(el)`、`exitFullscreenSafe()`，处理 `webkitRequestFullscreen` / `webkitExitFullscreen` 等。
2. **`VfsMainScreen.vue` 模板**：为 `section.vfs-preview-body` 增加 `ref="previewBodyEl"` 与 `data-testid="vfs-preview-body"`（便于测试）。
3. **全屏按钮**：放入 `vfs-preview-chrome-actions`，与现有按钮同一视觉层级；`@click` 调 composable。
4. **返回按钮**：`@click` 改为调用 `onPreviewBackClick()`：若 composable 报告处于全屏则 `exit`，否则 `restoreViewerOriginOrFallbackToList()`。
5. **`fullscreenchange` 监听**：更新 `isPreviewFullscreen`；用于图标 `fa-expand` ↔ `fa-compress`。
6. **`onBeforeUnmount`**：`exitFullscreenSafe()`（若当前全屏元素在 `previewBodyEl` 子树内）。
7. **CSS**：` .vfs-preview-body--fullscreen { min-height: 100dvh; display: flex; flex-direction: column; ... }` 等，不破坏非全屏布局。
8. **（可选）PRD 5**：`v-if="mode === 'editor'"` 包裹保存按钮（及仅编辑有意义的预览切换若业务要求）——若改动非全屏行为，需产品确认；SPEC 默认**全屏与非全屏一致**，不在首版强行改 reader 顶栏。

## 测试策略

### 测试用例

**单元 / 组件（jsdom）**

1. Mock `HTMLElement.prototype.requestFullscreen` = `vi.fn(() => Promise.resolve())`，`document.exitFullscreen` 同理；mock `document.fullscreenElement` getter 可控。
2. 挂载 `VfsMainScreen` 并进入预览栈（复用 `vfs-ui-cr-loop` 中 `selectDocsFile` + `open` 辅助），断言存在 `[data-testid="vfs-preview-fullscreen-toggle"]`。
3. 点击全屏 toggle：expect `requestFullscreen` 在 **`previewBody`** 元素上调用（或 ref 对应元素）。
4. 模拟 `document.fullscreenElement = previewBody`，点击返回：expect `exitFullscreen` 被调用且**未**触发列表模式（可通过 spy `requestModeChange` 若可及，或通过未出现 `vfs-list-only-layout` 断言）。
5. 非全屏下点击返回：保持现有用例行为（已有覆盖则勿破坏）。

**手动**

- 真机 Chrome/Safari：预览栈 → 全屏 → 滚动正文 → Pre/Next → 保存（编辑）→ 返回退出全屏 → 再点返回回目录。
- 弹窗关闭（X）时确认无残留全屏。

## 风险与回滚方案

| 风险 | 缓解 | 回滚 |
|------|------|------|
| iOS Safari 对元素全屏支持有限 | 能力检测 + toastr；README 一句已知限制 | 禁用按钮 |
| 全屏时 `dialog` 与 Fullscreen 层叠行为怪异 | 优先在 Chrome/Edge 验证；问题则改全屏目标为 `vfs-preview-content-frame` 并在其内复制一条迷你工具条（二期） | 移除全屏按钮与 composable |
| 卸载时未 exit 导致黑屏全屏层 | `onBeforeUnmount` + lifecycle 兜底 | 热修补钩子 |

---

**编码前请确认本 `spec.md`**。若你希望「返回」在全屏下仍**直接回目录**（同时 exit），与当前 PRD「先退出全屏」冲突，需先改 PRD 再实现。
