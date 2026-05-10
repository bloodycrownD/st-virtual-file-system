# row-menu-stable-parity — 规格说明

## 背景与动机

在 VFS 文件管理面板中，工具栏「三点」与每一行末尾「三点」在 DOM 上都表现为相同的 `details.vfs-action-menu` 结构，用户直觉上认为是同一套组件。实际观察到的现象是：**header 三点在长序列点击 / 外部-dismiss 后仍然稳定**，而 **row 三点在「打开 → 点击窗口外部关闭 → 再次打开」等路径后出现按钮无响应**。

用户诉求：**既然 header 路径稳定，希望 row 侧复用同一套稳定实现**（本次澄清：row 的呈现可以与 header **完全一致**，不要求保留此前的 fixed overlay 锚点方案）。

## 技术事实（现状）

- Header 与 row **已经共用**同一 Vue 组件：`src/app/components/business-components/VfsActionMenu.vue`。
- 差异来自 `mode`：
  - Header：`mode="global-create"`（`VfsMainScreen.vue` 通过 `#actions` 插槽挂载）。
  - Row：`mode="entity-actions"`（`VfsFileManagerPanel.vue` 每行一个实例）。
- 组件内部对 `mode === 'entity-actions'` 另有分支（例如 deferred 的外部-dismiss 监听绑定、`position: fixed` + CSS 变量锚定的下拉层、以及 resize/scroll 重定位）。**Header 不使用这些分支**，因此「看起来是两个组件」本质是 **同一组件的两套生命周期/布局策略**。

## 目标

1. **行为对齐**：row 菜单在与外部 dismiss、重复打开、与 header 菜单互斥（单开）等行为上与 header **一致**，不再出现「点击三点无响应」类失效。
2. **实现对齐**：移除或收敛 **仅为 entity-actions 引入**、且与 header 稳定路径不一致的逻辑（用户已确认 **可与 header 完全一致**，允许放弃 row 专用 overlay 布局）。
3. **可验证**：保留并更新自动化回归，覆盖「多次外部 dismiss 后再打开」路径；必要时补充与 header 对称的断言。

## 范围

### In

- `VfsActionMenu.vue`：`entity-actions` 与 `global-create` 的外部-dismiss、打开同步、`toggle`/`click` 交互路径收敛。
- 与 row 菜单相关的样式：删除或停用 `entity-actions` 专用的 overlay/锚点样式与脚本（若与「与 header 一致」冲突）。
- `test/vfs-ui-cr-loop.spec.ts`（及相关）：更新对 row 菜单 DOM/CSS 的断言（若布局从 fixed overlay 改为与 header 一致）。
- 必要时微调 `VfsFileManagerPanel.vue` 中行内容器（例如 `vfs-fm-row-actions`）**仅限**于防止裁剪/遮挡——以「与 header 下拉一致」为准，不做额外交互分叉。

### Out

- 变更 header 菜单的可视规格（除非收敛过程中发现共用样式必须微调——需在 plan 中注明）。
- 重做「拆分 header create / row entity」的产品结构（仍保留两种 `mode`，仅收敛实现）。
- 非菜单类的 VFS 功能（VfsCore、持久化、预览/编辑流转等）。

## 功能需求

- **FR-1（单一稳定路径）**：`global-create` 与 `entity-actions` 共享同一套「打开 → 注册外部 dismiss → 关闭时 teardown」策略；禁止存在仅 row 使用的 deferred bind 路径，除非能证明与 header 等价且通过手工复现验证。
- **FR-2（布局一致）**：row 下拉层的定位方式与 header 一致（同一套 list 定位规则）；不再依赖 per-row `getBoundingClientRect()` 锚定与 `window` scroll/resize 重绑（除非二者共享且 header 也在用）。
- **FR-3（互斥单开）**：保留现有「popup 内同一时刻仅一个 `details.vfs-action-menu` 展开」的规则。
- **FR-4（无回归）**：现有针对菜单、文件管理布局、创建流程等的测试全部通过；更新的断言需反映新布局。

## 验收标准（AC）

- **AC-1**：手工：在真实浏览器中，对同一 row 三点重复执行「打开 → 点击对话框外区域 dismiss → 再打开」≥10 次，无卡顿、无「点击无响应」。
- **AC-2**：手工：header 与 row 交替打开 dismiss，行为与 header 单独使用时一致稳定。
- **AC-3**：自动化：`pnpm test`（或项目既定命令）全绿；row 菜单稳定性用例与 header 对称或通过统一辅助断言覆盖。
- **AC-4**：视觉上 row 与 header 三点菜单使用相同的下拉样式与定位语义（用户已确认接受与 header 完全一致）。

## 风险与权衡

- **先前 row overlay 目标**（不牵动父级滚动、贴右下角等）让位于 **稳定性与实现统一**；若后续仍需 overlay，应作为独立迭代重新引入，并建立在已与 header 对齐的稳定生命周期之上。

## 文档确认

本 spec 与对应 `plan.md` 经 `/iteration-change` 澄清后定稿；开发前需用户确认两份文档。
