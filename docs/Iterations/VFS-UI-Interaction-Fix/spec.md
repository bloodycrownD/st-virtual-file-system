# VFS UI/交互修复 需求说明

## 背景

`st-virtual-file-system` 扩展在 SillyTavern 中存在多处 UI/交互问题：

- 入口按钮过大（文本按钮 `VFS`），不符合宿主 `extraMesButtons` 区域的按钮规格（右上角截图即为 `.extraMesButtons` 的展示效果）。
- 点击入口按钮无响应，导致弹窗无法打开或用户感知为“没有任何反馈”。
- 设置面板（inline drawer）与弹窗内按钮出现文字竖排/纵向换行等布局异常。
- 打开配置面板（inline drawer）或弹窗后样式失效（呈现为白底/不匹配主题/按钮不像 ST 的按钮）。
- 文件面板内 `Up / 文件操作 / 更多操作` 点击无响应。

这些问题阻断了 VFS 的主要使用路径（打开→浏览→操作），必须在不改变 VFS 核心协议/域模型的前提下修复 UI 挂载与宿主兼容性。

## 目标

- **入口按钮**：将 VFS 入口按钮改为与宿主一致的图标按钮（FontAwesome），并稳定挂载在 `.extraMesButtons`。
- **可用性**：同时修复两类“无响应”：
  - 点击入口按钮不打开弹窗
  - 弹窗打开但白板/不可交互（点击不生效）
  
  最终要求：点击入口按钮必定打开 VFS 弹窗；弹窗内主要交互（Up/更多操作/文件项/菜单项）均可触发。
- **样式一致**：尽量复用 SillyTavern 原生样式（如 `.mes_button` / `.menu_button`），避免出现“白板/样式失效”。
- **布局稳定**：设置面板（inline drawer）与弹窗内按钮文字不竖排、不逐字换行；小屏可合理换行/横向滚动。

## 范围

### 包含范围

- **入口按钮（P0）**
  - 入口按钮 DOM 结构、样式类名、事件绑定方式调整（参考 `st-better-database` 的 `ExtraMesButtons.vue`）。
  - 入口按钮图标使用 `fa-folder-tree`，并提供 `title="虚拟文件系统"`。
- **弹窗打开与交互（P0）**
  - 修复“点击无响应”：确保点击事件绑定稳定，不因宿主重渲染导致丢失。
  - 弹窗层级与点击穿透：确保弹窗/内容区域能接收 pointer events。
  - 弹窗内 `Up / 更多操作 / 文件项点击` 可触发对应事件。
- **设置面板（inline drawer）与样式修复（P0）**
  - 覆盖扩展设置页（`#extensions_settings` 内的 inline drawer）与弹窗两处 UI。
  - 尽量复用 ST 按钮/面板样式类；必要时补充少量 scoped/全局 CSS 来修复 `<dialog>` 默认样式差异。
  - 修复“设置面板按钮文字纵向排列”问题（tab/按钮 `white-space` 等）。

### 不包含范围

- 不改动虚拟工具协议（`<virtual-tool-call>`/`<virtual-tool-result>`）与 `ToolDispatcher` 语义。
- 不实现新的文件操作能力（仅修复现有 UI/绑定/样式）。
- 不新增复杂的后端/网络依赖。

## 功能需求

### FR-1 入口按钮图标化并对齐宿主按钮规格

- **挂载位置**：`.extraMesButtons`
- **结构**：与宿主一致，使用 `.mes_button` 风格的点击容器（而非宽大的 `menu_button` 文本按钮）。
- **图标**：FontAwesome `fa-folder-tree`
- **可访问性**：具备 `title` 与可聚焦/可点击行为

### FR-2 入口点击稳定打开弹窗

- 点击入口按钮后必须调用 `useVfsPopupLifecycle().open()` 打开 VFS 弹窗。
- 事件绑定必须在宿主 DOM 更新后依然有效：
  - 推荐使用 **事件委托**（例如 `$(document).on('click', selector, handler)`），避免直接绑定在可能被替换的 DOM 上。
  - 清理时必须解除绑定，避免重复注册导致多次触发。

### FR-3 弹窗样式与层级修复（尽量复用 ST）

- 弹窗容器应具备明确的 class（例如 `st-vfs-popup`）以便施加必要样式。
- 弹窗 backdrop/内容区颜色需与 ST 深色主题一致（避免“白板”）。
- 弹窗需处于可交互层级（z-index 合理），不会被宿主遮挡。

### FR-4 设置面板与 Tab 按钮文字不竖排

- 扩展设置页（inline drawer）与 `VfsTabShellScreen` 的按钮/tab 需要具备不竖排的约束：
  - `white-space: nowrap`
  - `writing-mode: horizontal-tb`
  - 在窄屏下允许容器横向滚动或换行（但不能逐字竖排）

### FR-5 文件面板操作可点击

- `VfsFileManagerPanel`：
  - `Up` 点击触发 `upRequested`
  - 单击列表项触发 `selected`
  - 双击目录触发 `opened`
- `VfsActionMenu`：
  - 点击“更多操作”能展开菜单
  - 菜单项点击触发 `actionSelected`

## 非功能需求

- **兼容性**：适配不同 SillyTavern 版本/主题对 `.extraMesButtons` 的重渲染行为。
- **幂等性**：重复初始化/挂载不应产生重复按钮、重复事件监听或内存泄漏。
- **可维护性**：入口按钮/弹窗样式改动集中，避免在多个组件里散落宿主兼容 hack。

## 验收标准

### AC-1 入口按钮外观
- 在聊天界面 `.extraMesButtons` 区域出现 VFS 图标按钮（`fa-folder-tree`）。
- 按钮大小与同区域其他图标按钮一致（不再显示大号 “VFS” 文本按钮）。

### AC-2 入口按钮可用性
- 点击 VFS 图标按钮，弹窗必定打开（至少 10 次连续点击与多次切换聊天后都成功）。

### AC-3 弹窗样式与交互
- 弹窗不为纯白底；文字/按钮在深色主题下可读。
- 弹窗中：
  - 点击 `Up` 有行为变化（路径变化或根目录禁用）。
  - 点击文件项可选中（出现选中态）。
  - 双击目录可进入目录。
  - “更多操作”可展开，点击动作可触发（例如 view/edit/rename/delete）。

### AC-4 设置/Tab 按钮不竖排
- Tab 按钮（文件管理器/提交记录/日志）文字不竖排、不逐字换行。
- 窄屏下仍可使用（可横向滚动或换行到下一行，但仍横向排字）。

## 风险与待确认项

- **宿主 DOM 变动风险**：`.extraMesButtons` 容器在某些页面/状态可能不存在或被替换。需要明确重试策略（轮询/observer）与最大重试次数。
- **CSS 冲突风险**：SillyTavern 主题/插件可能覆盖 `<dialog>` 默认样式，需要最小化全局 CSS 污染范围（尽量限定在 `#st-vfs-popup` / `.st-vfs-popup`）。
- **事件重复绑定风险**：入口挂载与弹窗生命周期需确保 `on/off` 配对，避免重复触发导致“点击一次打开两次”。

