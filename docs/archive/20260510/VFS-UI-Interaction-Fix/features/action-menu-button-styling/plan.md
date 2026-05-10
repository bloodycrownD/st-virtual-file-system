# action-menu-button-styling 设计方案

## 设计目标

- 修复“更多操作”下拉菜单项的默认态样式异常，使其更接近 ST 原生按钮体系。
- 保证局部生效、不污染宿主其它区域。

## 总体方案

### 1) 复用 ST 按钮体系（优先）

- 菜单项按钮优先加上/复用 `menu_button` class（若当前未使用）。
- 若不适合直接套 class，则在 VFS 弹窗作用域内用 CSS 模拟 `menu_button` 的关键视觉要素（padding、圆角、颜色）。

### 2) 局部 CSS 兜底（限定在 popup）

在 `src/styles/st-vfs-dialog.css` 中添加 scoped 规则（仅作用于 `#st-vfs-popup`）：

- selector：`#st-vfs-popup .vfs-action-menu__list button[role="menuitem"]`
- 设置：
  - `width: 100%`
  - `text-align: left`
  - `padding`、`border-radius`
  - `color/background` 使用 ST 主题变量（避免硬编码）

## 最终项目结构

```text
docs/Iterations/VFS-UI-Interaction-Fix/features/action-menu-button-styling/
  spec.md
  plan.md

src/styles/st-vfs-dialog.css
src/app/components/business-components/VfsActionMenu.vue (如需补 class)
```

## 变更点清单

- `src/styles/st-vfs-dialog.css`
  - 新增菜单项按钮 default 样式（popup 作用域内）

- `src/app/components/business-components/VfsActionMenu.vue`（如需）
  - 为菜单项按钮补 `menu_button` class，以最大化复用 ST 原生样式

## 详细实现步骤

1. 观察当前菜单项 DOM（`VfsActionMenu`）并确定是否可直接加 `menu_button` class
2. 在 `st-vfs-dialog.css` 添加 popup scoped 的 menuitem default 样式兜底
3. 手工回归：
   - 打开弹窗 → 展开更多操作 → 检查“新建目录/新建文件”可读性与间距
4. `npm run build` 验证

## 测试策略

### 测试用例

- **TC-1 默认态可读性**
  - 展开更多操作，下拉项文字清晰可读，背景与边框不突兀

- **TC-2 宽度与对齐**
  - 菜单项按钮宽度一致、左对齐、点击热区合理

## 风险与回滚方案

- **风险**：ST 主题变量不一致导致部分主题下仍异常
  - 缓解：使用 `var(--SmartThemeBodyColor, ...)` 等回退值
- **回滚**：删除新增的 scoped CSS 规则与 `menu_button` class 补丁即可

