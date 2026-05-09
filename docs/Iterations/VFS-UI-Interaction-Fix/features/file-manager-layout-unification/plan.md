# file-manager-layout-unification 设计方案

## 设计目标

- 在 `files + list` 阶段移除“右侧空白主区”，让文件管理区域成为唯一主视图。
- desktop/mobile 行为统一，避免“一个有空白区一个没有”的体验差异。
- 保证 `reader/editor/slideshow` 模式渲染不受影响。

## 总体方案

### 1) 渲染条件重构（以 mode 为核心）

当前结构在 desktop 下固定渲染 `aside + main`，list 时 `main` 仅显示占位文案。  
改造后：

- `mode === 'list'`：
  - 渲染单一 `VfsFileManagerPanel` 容器（全宽）
  - 不渲染 `vfs-content` 占位主区
- `mode !== 'list'`：
  - 保留现有内容视图渲染（reader/editor/slideshow）

### 2) 样式策略

- 新增或调整 list 模式容器 class（例如 `vfs-list-only-layout`）：
  - desktop：取消双栏 grid
  - 让文件管理区域占满主内容宽度
- 清理与空白占位相关样式（如仅服务于 `vfs-empty` 的布局样式）

### 3) 占位文案移除

- 删除 `Select an item then use More.` 对应模板节点
- 删除不再使用的测试标识/样式（若存在）

## 最终项目结构

```text
docs/Iterations/VFS-UI-Interaction-Fix/features/file-manager-layout-unification/
  spec.md
  plan.md

src/app/screens/business-screens/
  VfsMainScreen.vue   # list 模式模板与布局逻辑重构
```

## 变更点清单

- `src/app/screens/business-screens/VfsMainScreen.vue`
  - 调整 `files` 页模板：
    - `mode=list` 仅渲染文件管理区
    - 移除占位块 `Select an item then use More.`
  - desktop/mobile 逻辑对齐
  - 更新 scoped CSS：删除/替换双栏 list 阶段样式

## 详细实现步骤

1. 修改 `VfsMainScreen` 模板条件：
   - 抽出 list-only 分支，统一 desktop/mobile 的 list 主视图
2. 删除占位文案节点与关联 class
3. 调整 scoped CSS 保证 list-only 全宽
4. 本地构建与手工回归：
   - files/list 是否全宽
   - mode 切换是否正常

## 测试策略

### 测试用例

- **TC-1 desktop list 全宽**
  - 进入 `files` tab，`mode=list`，确认仅显示文件管理区，无右侧空白主区

- **TC-2 mobile list 一致**
  - 在 mobile 布局下进入 `files + list`，确认无多余占位区，与 desktop 行为一致

- **TC-3 占位文案移除**
  - 页面中不再出现 `Select an item then use More.`

- **TC-4 模式切换回归**
  - 从 list 切换到 reader/editor/slideshow，再切回 list，布局与功能都正常

## 风险与回滚方案

- **风险**：若用户习惯双栏，单栏可能被认为“信息减少”。
  - 处理：本 feature 需求已明确优先宽度与统一性；后续如需可单独加“详情侧栏”作为可选功能。
- **回滚**：
  - 仅需回滚 `VfsMainScreen.vue` 的模板与样式变更即可恢复双栏占位实现。

