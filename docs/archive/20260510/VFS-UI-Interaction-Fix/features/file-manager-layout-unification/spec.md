# file-manager-layout-unification 需求说明

## 背景

当前 `files` 页在 `mode=list` 下采用左右双栏布局：

- 左侧：文件管理面板（可操作）
- 右侧：主内容区（显示占位文案 `Select an item then use More.`）

在日常文件管理阶段，主要操作都发生在左侧，右侧仅占位会导致：

- 有效操作宽度被压缩
- 视觉上出现“空白区域占据主空间”的割裂感

## 目标

- 在 `files` 页且 `mode=list` 时，界面改为**单区展示**：只显示文件管理区，移除右侧空白内容区。
- 统一 desktop 与 mobile 行为，减少布局切换心智负担。
- 删除占位文案，不再渲染该占位块。

## 范围

### 包含范围

- `VfsMainScreen` 的 `files + list` 模式布局改造：
  - desktop：不再渲染右侧 `main.vfs-content` 空白占位区
  - mobile：保持列表为主，但行为与 desktop 规则一致（list 即“文件管理全宽主视图”）
- 删除 `Select an item then use More.` 相关占位渲染。
- 样式调整以保证单区展示时宽度最大化与视觉一致。

### 不包含范围

- 不改动 `reader/editor/slideshow` 模式的业务逻辑。
- 不新增新的右侧信息面板（本次目标是移除空白占位，不是替换为新内容）。

## 功能需求

### FR-1 files/list 模式单区化

- 当 `slotTab === 'files' && mode === 'list'`：
  - desktop 仅渲染文件管理区，不渲染右侧内容区
  - 列表区应占据可用主宽度

### FR-2 占位文案移除

- 不再显示 `Select an item then use More.` 占位文案
- 不再保留仅用于该占位文案的空容器

### FR-3 跨端一致性

- desktop/mobile 在 list 阶段都表现为“文件管理主视图”，无多余占位区域

## 非功能需求

- **视觉一致**：从 `list -> reader/editor/slideshow` 切换应自然，不出现突兀跳变。
- **可维护性**：布局条件表达清晰，避免后续 mode/tab 判断分散。

## 验收标准

- **AC-1 宽度最大化**：`files + list` 时，文件管理区域明显变宽（不再被右侧空白区挤压）。
- **AC-2 占位移除**：页面中不再出现 `Select an item then use More.` 文案。
- **AC-3 一致性**：desktop/mobile 在 list 阶段均无“空白右侧主区”，交互路径一致。
- **AC-4 模式切换**：切换到 reader/editor/slideshow 仍正常显示对应内容，不影响现有功能。

## 风险与待确认项

- 由于 desktop 从双栏变单栏，可能影响部分用户对“左列表右详情”的预期；但本需求已明确优先“操作宽度最大化 + 统一性”。

