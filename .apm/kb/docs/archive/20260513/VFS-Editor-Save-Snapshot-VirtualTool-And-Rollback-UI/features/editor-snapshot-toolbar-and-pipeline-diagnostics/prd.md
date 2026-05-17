# 编辑器快照条布局 / 自定义下拉 / 消息管道诊断日志 PRD

## 背景与变更动机

在完成「保存即快照」「`MESSAGE_UPDATED` 走虚拟工具管道」等首版实现后，实际使用仍有三类问题：

1. **布局**：预览顶栏中，版本回滚相关控件与标题的排布导致**遮挡或挤压** `vfs-preview-file-title`；期望将**快照选择 + 回滚**作为**左对齐**区域，紧邻 **`vfs-preview-back-button`（返回）** 一侧，与右侧「预览/保存/幻灯片」等操作区分，避免与标题争用同一弹性空间。
2. **组件形态**：当前快照选择使用 **原生 `<select>`**，与扩展内已有 **自定义 listbox**（`VfsActionInputDialog` 中 `role="combobox"` + 弹出 `listbox`、键盘与 `aria-*` 行为）不一致；需改为**可复用共享组件**，统一交互与视觉。
3. **虚拟工具在「编辑保存」仍不生效**：首版虽已扩展 `MESSAGE_UPDATED`，现场仍出现**需整页刷新才执行**；需在**不依赖用户开关**的前提下，于浏览器 **console 始终输出结构化诊断日志**（含是否收到事件、逻辑 kind、是否进入 `handler.process`、是否 `handled`、消息索引与正文摘要等），以便确认 SillyTavern 实际派发的事件名与参数形态，并指导下一版修复（例如 `record.mes` 滞后时改读 `args[1]`、或补挂其它 `event_types`）。

## 范围变更说明（相对原需求）

| 原 spec / PRD 范围 | 本变更 |
|---------------------|--------|
| 快照下拉位于 `vfs-preview-chrome-actions` 与保存等同排 | **改为**：快照选择 + 回滚按钮置于**返回按钮右侧的左组**；右侧 chrome 仅保留预览切换、保存、幻灯片翻页等（具体以最终实现与视觉走查为准）。 |
| 使用原生 `<select>` 作为可接受方案 | **改为**：必须使用 **共享自定义 listbox 组件**（与 `VfsActionInputDialog` 的 select 行为对齐），禁止在编辑器快照场景使用原生 `<select>`。 |
| 管道层接纳 `MESSAGE_UPDATED` 即视为编辑路径闭环 | **追加**：在结论未由现场日志证实前，增加**始终 console 诊断**（可带统一前缀如 `[st-vfs][vt-msg]`），用于验证「事件是否触发 / 文本取自 record 还是 args」。不改变业务语义的前提下允许后续根据日志再改读取策略（该策略变更可另开 micro-spec 或在本 feature 第二轮合入）。 |

**不包含（本变更 PRD）**

- 不承诺在不读日志的情况下一次性根治所有 ST 版本的编辑保存差异（根治依赖日志结论后的跟进提交）。
- 不在本变更中扩大「执行与回滚」全局面板的改版范围。

## 影响模块与接口

| 区域 | 影响说明 |
|------|----------|
| `VfsMainScreen.vue` | 调整 `vfs-preview-top-bar` DOM 结构：左组（返回 + 快照 listbox + 回滚）；中区标题；右组其余按钮。更新 scoped 样式（`flex`、`min-width`、`gap`），保证标题 `ellipsis` 不被遮挡。 |
| 新建共享组件（名称实现阶段确定，示例：`VfsListboxButton.vue`） | 从 `VfsActionInputDialog.vue` 的 listbox 交互抽出**可复用**触发器 + 面板 + 键盘逻辑；通过 `props` 传入 `options: { label, value }[]`、`modelValue`、占位文案、`disabled`、`aria-label` 等；`emits` 更新值。`VfsActionInputDialog` 在可行时**改为包装该组件**（减少重复），若风险大可先仅 `VfsMainScreen` 使用新组件、对话框后续重构（实现阶段二选一，**优先**复用抽取件）。 |
| `message-pipeline.ts` / `message-controller.ts` / `st-event-adapter.ts`（按需） | 在 `pipeline.run` 入口、kind 门闸前后、`handler.process` 返回后打日志；必要时在 adapter 注册处打印**实际注册的 ST 事件名字符串**（仅注册时一次或低频，避免刷屏）。日志需节流敏感信息：消息正文仅记录**长度 + 首尾若干字符**或是否包含 `<virtual-tool-call>`。 |
| `VirtualToolMessageHandler`（可选） | 在 `handled` / `skipped` 分支打简短日志（锁占用、无 call、多 result 等），与管道日志同一前缀便于过滤。 |
| 测试 | 更新 `vfs-ui-cr-loop` 等对 `editor-snapshot-select` 的查询方式（改为 listbox 的 `data-testid` 约定）；快照相关交互测试改用触发器 + 选项按钮。 |

## 验收标准

1. **布局**：在桌面宽度下，编辑器模式下预览顶栏中，**返回按钮右侧**可见快照 listbox 与回滚按钮；**文件标题**完整可读，不被 listbox 覆盖；窄屏下允许折行，但标题与左组不应重叠（可接受标题换行或截断，但不可被控件压住）。
2. **组件**：快照选择**不出现**原生 `<select>`；使用共享 listbox，具备与 `VfsActionInputDialog` 类似的 **combobox + listbox** 语义及键盘（↑/↓/Enter/Escape）与点击外部关闭。
3. **日志**：在用户编辑并保存一条含 `<virtual-tool-call>` 的消息时，浏览器控制台**始终**出现带统一前缀的日志，至少包含：**事件来源（adapter 层事件名字符串 + 逻辑 kind）**、**messageIndex**、**是否进入 `handler.process`**、**返回的 `handled` 与原因简述**（如 `no-call`、`lock`、`disabled`）。不打印完整消息正文。
4. **功能回归**：chat 保存仍走「单事务保存 + 预快照」；模板域不受影响；虚拟工具在已支持的 `MESSAGE_RECEIVED` / `MESSAGE_EDITED` / `MESSAGE_UPDATED` 路径上行为不回退。

## 测试用例

1. **UI（Vitest + `@vue/test-utils`）**：mount `VfsMainScreen`，进入某文件编辑器模式；断言快照控件 `data-testid`（如 `editor-snapshot-listbox-trigger`）存在于**返回按钮**所在左组；断言不存在原生 `<select data-testid="editor-snapshot-select">`（或等价断言无 `<select>`）。
2. **Listbox 交互**：打开 listbox，选择一项，emit/model 更新为对应 `snapshotId`；Escape 关闭；点击外部关闭（可仿照 `VfsActionInputDialog` 现有测例风格，若无则补最小用例于新组件 spec 文件）。
3. **日志（单测）**：对 `createMessagePipeline` + mock `handler`，断言在 `MESSAGE_UPDATED` 时 **console 被调用**且日志对象/子串包含 `messageIndex` 与 `handled`（使用 `vi.spyOn(console, 'log')` 或项目统一 logger；若当前无注入点，实现时**抽象薄层** `logVfsVirtualToolDiag` 便于单测）。
4. **回归**：全量 `npm test` 通过；`npm run build` 通过。

---

**文档路径**：`docs/archive/20260513/VFS-Editor-Save-Snapshot-VirtualTool-And-Rollback-UI/features/editor-snapshot-toolbar-and-pipeline-diagnostics/prd.md`

**已定案（AskQuestion）**：诊断日志为 **始终 console**；快照下拉为 **抽取共享组件**。

请确认本变更 PRD 是否可作为后续 `spec.md` / 实现的依据；若需调整左组与标题的优先级（例如标题绝对居中），请说明。
