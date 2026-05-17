# popup-debug-and-create-actions 设计方案

## 设计目标

- 让文件管理器在空目录下也能开始操作：提供新建目录/文件入口。
- 减少误判“无响应”：对禁用状态给出解释，并用 DEV 探针证明事件是否到达弹窗。
- 加固弹窗挂载：避免 `innerHTML` 被宿主重写导致 mount root 丢失，提供稳定的关闭能力。

## 总体方案

### 1) 文件管理器：新建目录/新建文件

- 在 `VfsFileManagerPanel` 的 path header 内增加两个按钮：
  - `新建目录` → emit `createDirectoryRequested`
  - `新建文件` → emit `createFileRequested`
- 在 `VfsMainScreen` 接收事件并执行 snapshot mutation：
  - 目录：`core.mkdir(targetPath, { recursive: true })`
  - 文件：`core.writeFile(targetPath, "", { createParents: true })`

### 2) “更多操作”禁用原因提示

- 在 `VfsActionMenu` 中新增 `disabledHint` computed：
  - 当 `entity` 为空时给 summary 加 `title`

### 3) 弹窗挂载：DOM 组装 + 关闭按钮

- `useVfsPopupLifecycle.open()`：
  - 用 `replaceChildren()` 清空
  - `createElement` 组装 `header`、`#st-vfs-popup-app`
  - `×` 按钮绑定到 `close()`，并在 dispose 时解除监听

### 4) DEV 探针（只在 DEV 生效）

- `useVfsPopupLifecycle`：
  - `const isDev = Boolean(import.meta.env?.DEV)`
  - DEV 时插入 `Test` 按钮，并挂 click handler：
    - `console.log` + 文本 `Test`/`Test✓` toggle
  - DEV 时注册 click probe：
    - dialog capture probe
    - document capture probe（composedPath 包含 popup 时）
  - dispose 时对称移除 listener

### 5) 弹窗交互兜底样式（限定作用域）

- `src/styles/st-vfs-dialog.css`：
  - `#st-vfs-popup` 与后代强制 `pointer-events: auto !important`
  - `::backdrop` 禁止 pointer events
  - `position: fixed` + `z-index` 保证位于上层

## 最终项目结构

```text
docs/Iterations/VFS-UI-Interaction-Fix/features/popup-debug-and-create-actions/
  spec.md
  plan.md

src/app/components/business-components/
  VfsFileManagerPanel.vue         # 新建按钮 emit
  VfsActionMenu.vue               # disabled hint title

src/app/screens/business-screens/
  VfsMainScreen.vue               # 处理新建事件并写入 snapshot

src/app/composables/screens-composables/
  useVfsPopupLifecycle.ts         # DOM 组装 + close + DEV 探针

src/styles/
  st-vfs-dialog.css               # pointer-events/z-index/backdrop 兜底
```

## 变更点清单（文件级）

- `src/app/components/business-components/VfsFileManagerPanel.vue`
  - 新增 `createFileRequested/createDirectoryRequested` emits
  - header 增加 `新建目录/新建文件` 按钮
  - 小幅样式（wrap + 按钮高度）

- `src/app/screens/business-screens/VfsMainScreen.vue`
  - 新增 `onCreateDirectoryRequested/onCreateFileRequested`
  - 通过 `applySnapshotMutation` 更新 snapshot
  - 在 desktop/mobile 两处 `VfsFileManagerPanel` 绑定新事件

- `src/app/components/business-components/VfsActionMenu.vue`
  - summary 增加禁用原因 `title`

- `src/app/composables/screens-composables/useVfsPopupLifecycle.ts`
  - 用 DOM 组装替代 `innerHTML`
  - 新增关闭按钮
  - DEV 探针与探针清理（只在 DEV）

- `src/styles/st-vfs-dialog.css`
  - pointer-events/backdrop/z-index 的兜底增强

## 详细实现步骤

1. 调整 `VfsFileManagerPanel`：新增按钮与 emits
2. 调整 `VfsMainScreen`：实现新建目录/文件的 mutation
3. 调整 `VfsActionMenu`：加入禁用提示 title
4. 调整 `useVfsPopupLifecycle`：DOM 组装 + close + DEV 探针
5. 调整 `st-vfs-dialog.css`：交互兜底
6. `npm run build` 验证

## 测试策略

### 测试用例

- **TC-1 新建目录**
  - 打开弹窗 → 点击 `新建目录` → 输入 `a`
  - 目录列表出现 `a`，可选中

- **TC-2 新建文件**
  - 点击 `新建文件` → 输入 `a.txt`
  - 列表出现 `a.txt`，可选中

- **TC-3 更多操作提示**
  - 未选中时 hover “更多操作”显示提示
  - 选中实体后展开菜单，点击 action 触发处理

- **TC-4 DEV 探针**
  - DEV 模式下 `Test` 可点击并输出日志
  - 点击 tab/summary 输出 probe 日志

## 风险与回滚方案

- **风险：prompt 交互体验不佳**
  - 回滚：保留事件接口不变，后续可替换为内联输入而不影响 VFS core。
- **风险：pointer-events 强制兜底与宿主冲突**
  - 回滚：移除 `#st-vfs-popup * { pointer-events: auto !important; }`，仅保留 dialog 根级兜底。

