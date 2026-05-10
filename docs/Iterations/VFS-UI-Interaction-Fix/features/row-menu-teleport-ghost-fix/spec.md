# row-menu-teleport-ghost-fix — 规格说明

## 变更动机与原因

在 `row-menu-portal-stable-overlay` 中，行末 `entity-actions` 菜单面板通过 **Teleport** 挂到 `#st-vfs-action-menu-teleport`。当前实现里 **每一行** 的 `VfsActionMenu` 实例 **在 `details` 关闭时仍持续渲染** Teleport 内的 `<ul>`；关闭路径会 **`panelFixedStyle` 置空** 以清除 `position: fixed` 坐标，但 **未卸载或隐藏** 该节点。

结合 `.vfs-action-menu__list--entity-fixed` 对 `top`/`right` 的 `unset` 与基础列表的 `position: absolute`，**无内联坐标** 的面板在 teleport 宿主内会落到 **默认几何位置**（用户可见为 **对话框内容区偏左上**），与 **当前打开行** 上带完整 `fixed` 内联样式的面板 **同时可见**，形成「双菜单」错觉（实为 **多实例残留 DOM**）。

## 与先前范围的关系

- **继承**：`row-menu-portal-stable-overlay` 的 Teleport + fixed 锚定、立即 capture dismiss、`AbortController` teardown、单开互斥等 **不得回归**。
- **本变更**：仅解决 **关闭/未打开态下 Teleport 面板仍可见** 的缺陷。  
  **基线说明**：实现假定分支上 **已存在** portal/teleport 行菜单与相关结构；此处 **代码增量** 仅为挂载/可见性守卫（如 `v-if` / `isOpen`）。**不改变** 相对该基线的动作集合、header 行为、列表选中语义（不在这迭代里另起一套产品变更）。

## 影响模块

- `src/app/components/business-components/VfsActionMenu.vue`（主）：`entity-actions` 下 Teleport 内面板的 **挂载/可见性** 与 `details.open` 对齐。
- `test/vfs-ui-cr-loop.spec.ts`（及若有组件单测）：断言 **teleport 容器内** 同时存在的 `vfs-entity-action-menu-panel` **至多一个**（或等价：关闭后无残留可见节点 —— 以可稳定自动化为准）。

## 功能需求

### FR-1 单可见面板

- 任意时刻，在 `#st-vfs-action-menu-teleport`（或 fallback 目标）内，**用户可见**的实体操作面板 **至多一个**，且仅当 **对应行的 `details` 为 open** 时存在。
- **不得**再出现「左上无内联 `style` 的完整菜单 + 另一处正确锚定菜单」并存。

### FR-2 关闭语义

- 外部 dismiss、选动作关闭、`closePeerMenus` 关闭 peer 时：**对应实例** 的 Teleport 面板 **立即**不可见（卸载或 `hidden`/`display:none` 等等价手段），且 **不依赖** 仅靠清空 `panelFixedStyle` 来“隐藏”。

### FR-3 无回归

- `row-menu-portal-stable-overlay` 相关行为保持：**fixed 锚定**、**scroll/resize 重定位**、**capture dismiss**、**header/row 互斥**。
- `npm run test:run`、`npm run build` 通过。

## 验收标准

| AC | 描述 |
|----|------|
| **AC-1** | **手工**：列表多行时，依次点开不同行三点，再全部外部关闭；**不应**在左上或其它固定角出现残留菜单。 |
| **AC-2** | **手工**：仅打开一行菜单时，teleport 内 **只有一份** 与当前行对应的可见面板。 |
| **AC-3** | **自动化**：Vitest 全绿；新增或强化用例：例如 mount 多行面板后断言 `querySelectorAll('[data-testid=\"vfs-entity-action-menu-panel\"]')` 在菜单全关时为 0，打开一行时为 1（若 JSDOM 与实现一致）。 |
| **AC-4** | **构建**：`npm run build` 通过。 |

## 范围外

- 重做 Teleport 宿主结构或改为全局单例 store（除非 plan 认定最小修复不足）。
- 改变菜单动作与业务逻辑。

## 文档确认

本 `spec.md` 与 `plan.md` 经 `/iteration-change` 产出；**请你确认后再改代码**。
