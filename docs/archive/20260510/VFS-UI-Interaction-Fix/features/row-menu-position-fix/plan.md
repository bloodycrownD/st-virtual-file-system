# row-menu-position-fix 设计方案

## 设计目标

- 修复行菜单跑位：菜单始终锚定当前行三点按钮。
- 修复滚动扰动：打开菜单不改变列表/弹窗父滚动位置。
- 保持 overlay 方式与 header 三点行为风格一致。

## 总体方案

### 1) 统一浮层定位模型（参考 header 三点）

- 复用 `VfsActionMenu` 的 overlay 结构（`details + summary + absolute list`）作为行菜单渲染基础。
- 行菜单容器提供稳定定位上下文：
  - 行菜单容器 `position: relative`
  - 菜单列表 `position: absolute; top: calc(100% + 8px); right: 0`
- 明确行菜单默认策略：**overlay-right-bottom**（不做自动翻转）。

### 2) 消除滚动扰动与布局参与

- 确保菜单列表脱离常规文档流，不影响行高/列表高度。
- 避免在菜单打开时触发布局位移：
  - 禁止通过 margin/padding 动态扩展父容器
  - 菜单使用固定最大高度并 `overflow: auto`（仅菜单内滚动）
- 对父容器保持 `overflow` 语义稳定，不因菜单开关切换产生滚动条闪现。

### 3) 裁切与层级修正

- 检查并修正行容器/列表容器的 `overflow` 与 stacking context：
  - 确保菜单浮层不被 `overflow: hidden` 裁切
  - 设置足够 `z-index`，但限制在 VFS popup 作用域内
- 保持与现有 `#st-vfs-popup` 作用域样式兼容，不污染宿主全局。

### 4) 行为与事件稳定性

- 保留“点击行末三点自动选中该行”的既有逻辑。
- 菜单项点击后关闭菜单，焦点行为与当前 `details/summary` 一致。
- 多行快速切换点击时，确保不会残留错位菜单。

## 预期改动文件

- `src/app/components/business-components/VfsActionMenu.vue`
  - 行菜单与 header 菜单共用定位/面板基线，必要时按 `mode` 加细分 class
  - 修正 overlay 定位/滚动约束样式

- `src/app/components/business-components/VfsFileManagerPanel.vue`
  - 调整行菜单容器样式，提供稳定定位锚点
  - 必要时补充防裁切样式（局部）

- `src/styles/st-vfs-dialog.css`（如需）
  - 在 popup 作用域内补充最小兜底层级/裁切规则

- `test/vfs-ui-cr-loop.spec.ts`（或新增专用测试）
  - 增加定位与滚动不扰动的关键回归断言

## 实施步骤

1. 复查当前行菜单 DOM/CSS，定位跑位与滚动触发点（定位上下文、overflow、z-index）。
2. 在 `VfsActionMenu` 收敛 overlay 样式，确保默认右下锚点固定。
3. 在 `VfsFileManagerPanel` 调整 row-actions 容器，避免菜单被裁切或参与行高。
4. 如有必要在 `st-vfs-dialog.css` 增加 scoped 兜底规则。
5. 补充/更新回归测试，执行 targeted test + build 验证。

## 测试策略

### 测试用例

- **TC-1 行锚点定位**
  - 点击第一行/中间行/末行三点，菜单都锚定在对应按钮附近（不串行）。

- **TC-2 打开菜单无父滚动扰动**
  - 记录列表与主容器滚动位置，打开/关闭菜单后滚动值不变。

- **TC-3 菜单不裁切**
  - 菜单在可视区域完整显示并可点击（至少验证一项动作触发）。

- **TC-4 双端一致**
  - desktop/mobile + chat/template 关键路径通过。

## 风险与回滚方案

- **风险**：为防裁切调整 overflow 后，可能影响列表内部滚动体验。
  - 缓解：优先局部调整行菜单容器，不改动主列表滚动容器语义。
- **回滚**：
  - 回滚行菜单定位相关样式与容器改动，恢复到上一稳定 commit，再逐步最小化修复。
