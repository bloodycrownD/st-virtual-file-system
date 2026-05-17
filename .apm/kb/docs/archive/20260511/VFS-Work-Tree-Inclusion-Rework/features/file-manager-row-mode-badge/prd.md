# 文件管理器列表行：纳入方式 / 目录规则 角标 PRD

## 背景与变更动机

工作树 v2 后，文件行的**灯泡**表示「是否纳入工作树」，但**未一眼区分**当前文件的**纳入方式**（显式纳入 / 显式排除 / 随父目录规则）。用户在列表主行（`.vfs-fm-item`）上希望**在按钮最右侧**增加与当前设计一致的**轻量提示**，减少反复打开菜单核对的心理成本。

目录行同理：灯泡已区分「目录纳入规则」开/关，但文字层面可再对齐，便于与文件行信息架构一致。

**问卷已定选择**（实现以此为准）：

- **文件行**：**图标 + 极短中文标签**（muted、不抢主名；完整语义靠 `title` / `aria`）。
- **目录行**：在按钮右侧增加 **「规则·开」/「规则·关」** 短标签（可与图标组合，风格与文件行统一）。

## 范围变更说明（相对原需求）

| 维度 | 原范围（主迭代） | 本变更 |
|------|------------------|--------|
| 数据模型 / 宏 / 解析 | v2 工作树纳入语义已落地 | **不修改**持久化与 `renderVirtualWorkTree` 行为 |
| 文件管理器列表 UI | 仅图标 + 名称 + 灯泡 + 行菜单 | 主行按钮内**右侧**增加**纳入方式**角标（图标 + 短字） |
| 目录行 | 仅灯泡表示规则门闸 | 主行内增加 **规则·开/关** 角标，与灯泡一致 |
| 文案语言 | PRD 术语「显式纳入 / 显式排除 / 随父目录规则」 | 行内用**极短**中文：**纳入**、**排除**、**随目录**；完整术语进 `title`/`aria` |

**不包含**：改变 `toggle-status` 循环顺序、新增独立弹窗、国际化资源文件（若需 i18n 另开迭代）。

## 影响模块与接口

| 模块 | 变更 |
|------|------|
| [`VfsFileManagerPanel.vue`](../../../../../../src/app/components/business-components/VfsFileManagerPanel.vue) | 扩展 `VfsBrowserEntity` 可选字段（示例名，实现可微调）：`rowBadgeIconClass?: string`、`rowBadgeLabel?: string`、`rowBadgeTitle?: string`、`rowBadgeAria?: string`；在 `.vfs-fm-item` 内 **flex 布局**：左侧保持 `kind` + `name`（`name` 继续 `ellipsis`），右侧为 **角标区**（`flex-shrink:0`，小字号、低对比）。目录与文件共用同一套 props，由父组件区分语义。 |
| [`VfsMainScreen.vue`](../../../../../../src/app/screens/business-screens/VfsMainScreen.vue) | 在 `directoryEntries` 的 `computed` 映射中，根据 `currentWorkTree` + `getFileInclusionMode`（或等价读取 `fileInclusionByPath` 缺省 `follow-parent`）为**文件**填充角标字段；**目录**根据 `directoryRuleEnabledByPath`（根恒开）填充「规则·开/关」及对应图标。 |
| 域类型 | 可复用 `WorkTreeFileInclusionMode` 自 `work-tree.types.ts`；**不新增**对外 API 契约变更。 |

**图标约定（实现时固定一套，写入代码注释）**：三态各选 **互不相同** 的 Font Awesome 6 solid 图标，与现有 header `fa-*` 风格一致；**目录**「规则·开/关」各选一图标（如 `fa-toggle-on` / `fa-toggle-off` 或 `fa-sliders` + 状态差异），避免与文件三态图标混淆。

## 验收标准

1. **文件行**：在 `.vfs-fm-item` 可见区域**最右侧**展示角标：**图标 + 短标签**，三态分别为 **纳入**、**排除**、**随目录**（对应 `explicit-include` / `explicit-exclude` / `follow-parent` 及缺省）。  
2. **目录行**：同位置展示 **规则·开** 或 **规则·关**（根目录恒为「开」语义，与 `VfsMainScreen` 根规则不可关一致）。  
3. **完整说明**：角标容器具备 `title`（及/或 `aria-label`）含完整中文说明，例如「纳入方式：显式纳入工作树」「目录纳入规则：已启用」。  
4. **布局**：长文件名时**主名省略号优先**，角标**不被挤出视区**（角标 `flex-shrink:0`；名称区 `min-width:0`）。  
5. **交互不变**：单击目录进入、双击文件打开、灯泡与行菜单行为与变更前一致。  
6. **视觉**：角标字色/字号与现有 `vfs-fm-row-status`、路径条等 **muted** 风格协调，无大块底色条（避免「第二行进度条」观感）。

## 测试用例

| # | 场景 | 步骤 | 期望 |
|---|------|------|------|
| T1 | 文件·随目录 | 某文件未在 `fileInclusionByPath` 中 | 行右侧角标含 **随目录** 及对应图标；`title` 含「随父目录规则」类说明 |
| T2 | 文件·显式纳入 | `fileInclusionByPath[path]=explicit-include` | 角标 **纳入** + 图标 |
| T3 | 文件·显式排除 | `explicit-exclude` | 角标 **排除** + 图标 |
| T4 | 目录·规则开 | 非根目录且 `directoryRuleEnabledByPath[dir]=true` | **规则·开** + 图标 |
| T5 | 目录·规则关 | `directoryRuleEnabledByPath[dir]!==true` | **规则·关** + 图标 |
| T6 | 根目录行 | 当前列为根下子目录 `path` 为某子目录 | 若该子目录规则关 → **规则·关**；开 → **规则·开**（根本身行若出现则恒开，与主迭代一致） |
| T7 | 长文件名 | 构造超长 `name` | 名称 `ellipsis`，角标仍完整可见 |

**自动化（建议）**：在现有 `vfs-ui` / 组件测中，对 `directoryEntries` 注入 mock `entries`（含角标字段）断言 DOM 文本/`data-testid`；或在 `VfsFileManagerPanel` 单测中断言渲染类名与标签字符串。

---

请确认本 `prd.md` 是否可直接进入实现（若需改成「仅图标、无短字」或调整目录文案，说明后我再改一版文档）。
