# row-menu-decouple-selection 设计方案

## 设计目标

将 **列表选中模型** 从文件管理器中移除，切断「行菜单 toggle → 同步选中 → 父级重渲染」链路，使行菜单的行为尽可能接近 header 菜单（无选中副作用），从根因上规避多次点击后的不稳定。

同时保留 **父级工作上下文**（当前预览/编辑对应的路径），但其更新只能来自 **显式业务动作**（导航、行菜单 entity payload、创建/删除/重命名等），而非列表“选中”。

## 方案概述

### A. `VfsFileManagerPanel`：删除选中 props/事件与样式

- 移除 `selectedPath` prop 与 `selected` emit。
- 移除 `isSelected` / `:data-selected` 绑定与对应 CSS（`.vfs-fm-row[data-selected='true'] ...`）。
- 移除行菜单 `@toggle-clicked="select(entry.path)"`（这是与 header 路径差异的核心耦合点）。
- 行主体按钮：
  - **目录**：保留 `@dblclick="open(entry)"`。
  - **文件**：移除 `@click="select(...)"`（或改为无操作）；避免任何隐式“选中同步”。

### B. `VfsMainScreen`：把 `selectedPath` 重新定位为“活动文档路径”（可选重命名）

内部仍可保留一个 `ref<string | null>` 用于：

- `refreshAuthoritativeState()` 同步编辑器内容
- `handleEntityAction` / save / rollback scope

但该 ref **不再由列表 `selected` 事件驱动**，而由：

- `handleRowEntityActionRequested`（已在调用 `handleEntityAction` 前写入路径；保持并作为行菜单主路径）
- 目录导航：`onOpened` / `onUpRequested` 清理活动路径（沿用现有语义）
- 创建/重命名/删除：沿用现有清理/更新规则

如命名造成误解，可将 `selectedPath` 重命名为 `activeContextPath`（仅重构命名，不改变语义），并在注释中写明：**不是列表选中**。

### C. 测试更新策略（`test/vfs-ui-cr-loop.spec.ts`）

- 删除或改写 `auto-selects row when row menu toggle is clicked`。
- 将依赖 `data-selected` / “选中行再触发菜单动作”的 helper（如 `triggerEntityAction`）改为：
  - 直接对目标行菜单触发动作，或
  - 使用 `entity-action-requested`/`组件 emit` 直达 handler（优先最小改动）。
- 新增重复点击用例：在 `window.innerWidth = 375`（mobile）与 desktop 宽度下对 **同一行菜单 toggle** 进行循环打开（可选叠加 document outside click），断言 `open` 属性与菜单列表可用性稳定。

### D. 验证命令

- `npm run test:run -- test/vfs-ui-cr-loop.spec.ts`
- `npm run build`

## 预期改动文件

- `src/app/components/business-components/VfsFileManagerPanel.vue`
- `src/app/screens/business-screens/VfsMainScreen.vue`（事件绑定与路径更新来源梳理；必要时命名澄清注释）
- `test/vfs-ui-cr-loop.spec.ts`（及相关如有引用选中模型的测试）

## 回滚策略

若移除列表单击后发现目录/文件导航可用性下降：

- 优先恢复 **目录双击导航** 与 **行菜单动作** 两条主路径；
- 仅在明确产品确认后，再考虑“单击文件打开预览”的替代交互。
