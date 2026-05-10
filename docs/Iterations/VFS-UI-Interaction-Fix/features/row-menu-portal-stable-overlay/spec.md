# row-menu-portal-stable-overlay — 规格说明

## 变更动机与原因

历史上两块改动形成了跷跷板：

1. **`row-menu-position-fix`**：要解决行末三点菜单 **错位、被裁切、打开后列表/弹窗滚动扰动**。为实现「浮层不牵动弹窗滚动」，曾引入 **`fixed` 视口锚点 + 与滚动相关的补丁**，随后在宿主环境里叠加 **`details`/程序化开关菜单与异步监听**，暴露出 **多次外部 dismiss 后三点失灵** 等问题。
2. **`row-menu-stable-parity`**：为解决 **监听生命周期不稳**，将 row 菜单收敛到与 header 相同的 **`relative + absolute` 下拉**，并 **立即** 绑定 capture dismiss、`AbortController` teardown；几何上与 header 复用同一套样式，但 **row 位于 `ul.vfs-fm-list { overflow: auto }` 内**，header 不在同一滚动口中，导致 **scrollHeight / 滚动条表现回流**，与用户截图一致。

用户不关心具体实现路线（Teleport、`fixed`、Portal 容器选型等），**只关心一次性消除两类缺陷**。本变更把两类验收合并到同一 feature，要求在 **同一交付** 中同时成立。

## 与先前范围的差异（边界演进）

| 文档 | 原先侧重点 |
|------|------------|
| `row-menu-position-fix` | 锚点正确、无父滚动扰动、不裁切；实现上侧重 overlay |
| `row-menu-stable-parity` | dismiss / reopen 稳定；曾接受 row 与 header **同源 CSS**，但未约束「滚动祖先不同」带来的溢出语义 |

**本变更**：在 **不回归交互稳定性** 的前提下，恢复 **`row-menu-position-fix` 中 FR 所指的用户可见效果**（见下文 FR）。**不限定**必须用某一种挂载 API；由 `plan.md` 给出可选方案，以能通过验收为准。

## 影响模块（接口层面）

- **UI**：行末 `VfsActionMenu`（`mode="entity-actions"`）及其宿主：`VfsFileManagerPanel.vue`、`VfsActionMenu.vue`；必要时仅限 popup 作用域内的兜底样式。
- **行为**：打开 / 外部 dismiss / 与 header 菜单 **单开互斥**、动作选择与关闭语义保持不变。
- **测试**：`test/vfs-ui-cr-loop.spec.ts`（及若有单列组件测试）更新或增补断言；不改变对外插件契约之外的 HTTP/API。

## 功能需求（效果约束）

### FR-1 行菜单可视与可操作（对齐 position-fix 的用户意图）

- 点击某一行的三点，菜单 **锚在该行三点附近**，不出现「飞到别的行 / 严重漂移以致难以点击」。
- 菜单 **不被列表或面板不合理裁切**；若视口不足，允许 **菜单自身** 内滚动（与现行面板样式一致），但不得以牺牲「父列表无端乱跳」为代价。

### FR-2 无父滚动扰动（核心：合并两类 bug）

- 在列表 **`overflow: auto`** 存在的前提下，打开或关闭行菜单 **不应** 引入下列任一劣化体验（以主观可见为准，辅以测试中可记录的滚动量断言为佳）：
  - 列表 **无端新增或减少可滚动范围**（例如仅为撑起下拉而导致的 **`scrollHeight` 变大**、滚动条「从无到有」闪烁后再也无菜单操作时仍异常）。
  - 打开 / 关闭菜单时 **列表 `scrollTop` 无理由跳变**（非用户滚动）。
- **说明**：header 三点仍可维持现有行为；本 FR **专门针对 row**，因其滚动祖先与 header 不同。

### FR-3 交互稳定（对齐 stable-parity 的体验）

- 在同一 row 三点上重复：**打开 → 点击对话框外 dismiss → 再打开**，循环 ≥ **10** 次（手工）；菜单必须 **每次可打开、每次可外部关闭**，不得出现 **按钮再无响应**。
- Header 与 row **交替**打开并外部 dismiss（手工）：不得卡死；并保持既有「popup 内 **至多一个** `details.vfs-action-menu` 展开」的规则。

### FR-4 监听与 teardown 语义

- 外部 dismiss 使用 **capture 阶段**、`AbortController`（或等价）保证 **一开一团灭**，禁止遗留仅在 row 路径生效的 **推迟绑定**（如 `setTimeout`/`queueMicrotask` **专为绕过点击顺序** 而拆分监听生命周期），除非附带证明其与 FR-3 等价且有自动化覆盖。
- **不约束**是否使用 Teleport、`fixed`、`popover` 等具体 API。

### FR-5 回归范围

- 既有：`split-action-menus`（header 仅创建、row 实体动作）、创建流程、`row-menu-decouple-selection`（无列表选中语义）等 **不得被破坏**。
- `npm run test:run` 与 `npm run build` 通过。

## 验收标准（AC）

| AC | 描述 |
|----|------|
| **AC-1** | **手工**：指定一行三点，`打开 → 点对话框外 → 再打开` ≥10 次，无失灵；列表无明显无理由跳动。 |
| **AC-2** | **手工**：header 与 row 交替 dismiss ≥各 5 轮，行为稳定，互斥单开仍成立。 |
| **AC-3** | **手工**：列表有足够条目出现纵向滚动条时，开关 row 菜单 **不改变**「仅靠菜单伸展而导致的怪异拉长滚动」体感（与 FR-2 一致）；可与开发者工具核对 `scrollTop`/必要时 `scrollHeight`（若在测试中固化更佳）。 |
| **AC-4** | **自动化**：Vitest 全绿；至少保留或增补覆盖 row **外部 dismiss + 多次 reopen** 与 **header/row 互斥** 的用例。 |
| **AC-5** | **构建**：`npm run build` 通过。 |

## 范围外

- 改变动作集合、权限模型或 VFS 业务语义。
- 重做整个文件管理布局（仅允许为通过 FR 所必需的局部容器调整）。
- 强制规定实现必须用某一种 DOM 挂载方式（由 plan 列举候选，spec 仅以效果为准）。

## 文档确认

本 spec 与 `plan.md` 供开发前评审；确认后再改代码。
