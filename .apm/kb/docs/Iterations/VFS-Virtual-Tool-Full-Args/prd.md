# VFS 虚拟工具结果完整入参展示 PRD

## 背景

消息标签通道执行虚拟工具后，会将 `<virtual-tool-call>` 替换为 `<virtual-tool-result>`。当前**成功**时，`calls` 中每项仅含 `argsSummary`（参数名字符串，如 `path,content`），完整 `args` 仅在**失败**时写入，便于排错。

用户在调试、复盘或与模型对照「当时传了什么」时，成功路径看不到真实入参，需对照日志或猜测。演进文档（`VFS-Virtual-Tools-Evolutions`）有意在成功路径压缩入参，避免 `read` 等大段 `content` 重复出现在 `calls` 与 `results.data` 中。

本迭代在**保留** `read` 等工具既有安全截断（`results.data` 硬上限不变）的前提下，为消息通道增加**可开关**的「成功时也写入完整 `args`」能力，由用户在扩展设置页控制。

## 目标（含成功指标）

### 业务目标

- 需要查看成功批次真实入参时，用户可在设置中开启后，直接从消息内 `<virtual-tool-result>` 阅读完整 `args`，无需依赖失败或扩展日志。
- 默认保持现有压缩行为，避免长对话中 result JSON 体积突然增大。

### 成功指标（验收期可观测）

| 指标 | 说明 |
|------|------|
| **可对照性** | 开关开启且批次 `ok:true` 时，抽样对比 `calls[i].args` 与执行前 call 块内 JSON 一致。 |
| **默认无回归** | 新安装/未改设置的用户，成功 result 仍为 `argsSummary`，与 v1.0.9 前行为一致。 |
| **范围隔离** | FC `vfs_*` 返回 JSON 不受本开关影响（仍按现有 FC 序列化规则）。 |

## 用户与场景

| 用户 | 场景 |
|------|------|
| **对话作者 / 工作流维护者** | 工具执行成功，想确认模型传入的 `path`、`oldContent` 等是否与预期一致 |
| **排错（成功但结果可疑）** | 批次 `ok:true` 但文件内容不对，需对照入参而非只看 `summary` |
| **日常聊天** | 关闭开关，保持 result 精简，减少 token 与界面噪音 |

**典型场景**：`replace` 成功写入后，开启开关即可在 result 的 `calls` 中看到完整 `oldContent` / `newContent`；关闭时仍只见 `path,oldContent,newContent` 形式的 `argsSummary`。

## 范围

### 包含范围

1. **仅消息标签通道**：`<virtual-tool-result>` 内 `calls` 的序列化规则；不涉及 Function Calling、`vfs_*` 的 `action` 返回体。
2. **独立扩展设置项**（设置页 checkbox + 简短说明）：控制成功时 `calls` 使用完整 `args` 还是 `argsSummary`。
3. **默认关闭**：与当前线上行为一致；用户显式开启后生效。
4. **失败语义不变**：`ok:false` 时 `calls` 仍含完整 `args`（与现有一致）；开关不改变失败路径。
5. **其它 result 字段不变**：`results`、`repairApplied`、`errorCode` 等保持现有语义；`read` 等工具的 `data` 截断上限不调整。

### 不包含范围

- FC / `formatFunctionToolResult` 的 `calls` 展示规则。
- `read` / `search` 等工具执行期的行数、字符硬上限。
- 聊天 UI 对 result 块的折叠、高亮、Markdown 渲染（若 ST 原生展示 JSON，本 PRD 不规定 UI 改造）。
- 历史消息中已有 result 的自动回填或迁移。
- 成功时在 `calls` 与 `results` 之间做去重、摘要算法改造。

## 核心需求（3-7 条）

1. **可开关的完整入参**：设置项开启时，消息通道成功批次（`ok:true`）的 `calls[]` 每项包含完整 `args` 对象；关闭时成功批次仍仅 `argsSummary`。
2. **默认保持现状**：设置项默认关闭，未配置用户与升级用户行为与当前版本一致。
3. **失败路径一致**：无论开关状态，失败批次（`ok:false`）的 `calls` 均含完整 `args`。
4. **设置页可发现**：开关位于扩展设置页虚拟工具相关区域，文案说明仅作用于消息标签、默认关闭、可能增大 result 体积。
5. **持久化**：开关值写入 `extensionSettings`，随扩展配置保存与加载。
6. **通道隔离**：FC 注册工具与返回 JSON 不读取、不实现本开关逻辑。

## 验收标准

### AC-1：开关关闭 — 成功仍为摘要（默认）

- **Given** 完整入参展示开关为**关**（默认），且虚拟工具批次执行**成功**（`ok:true`）
- **When** 查看替换后的 `<virtual-tool-result>` JSON
- **Then** 每项 `calls` 含 `tool` 与 `argsSummary`，**不含**完整 `args` 对象（与当前行为一致）

### AC-2：开关开启 — 成功含完整 args

- **Given** 完整入参展示开关为**开**，批次执行**成功**
- **When** 查看 `<virtual-tool-result>` JSON
- **Then** 每项 `calls` 含 `tool` 与完整 `args` 对象，且与执行前 call 块内对应项一致；**不**要求同时存在 `argsSummary`

### AC-3：开关开启 — 失败仍为完整 args

- **Given** 完整入参展示开关为**开**或**关**，批次执行**失败**（`ok:false`）
- **When** 查看 `<virtual-tool-result>` JSON
- **Then** `calls` 每项仍含完整 `args`（行为与现网失败路径一致）

### AC-4：FC 不受影响

- **Given** 仅通过 `vfs_*` Function Calling 执行工具，且消息通道开关为**开**
- **When** 查看 FC 返回给 LLM 的 JSON 字符串
- **Then** `calls` 序列化规则与开关关闭时相同（成功仍为 `argsSummary` 或现有 FC 约定，不引入完整 `args`）

### AC-5：设置页可见且可持久化

- **Given** 扩展设置页
- **When** 切换完整入参展示开关并刷新/重载扩展
- **Then** 开关状态与说明文案可见，且重新打开设置页后状态与上次保存一致

### AC-6：results 截断策略不变

- **Given** 对超大文件执行 `read` 且工具返回 `truncated: true`
- **When** 完整入参展示开关为**开**或**关**
- **Then** `results[].data` 仍遵守现有行数/字符硬上限；不因本开关取消 read 截断

---

**文档路径**：`.apm/kb/docs/Iterations/VFS-Virtual-Tool-Full-Args/prd.md`  
**说明**：本文件为需求 PRD；技术方案、设置键名、代码改动见后续 SPEC（非本 skill 默认产出）。
