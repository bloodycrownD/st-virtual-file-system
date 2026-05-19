# VFS 虚拟工具调用 JSON 自修复 PRD

## 背景

在消息通道中，模型通过 `<virtual-tool-call>` 提交工具批次，中间载荷为 JSON。实际对话里常出现括号不匹配、尾逗号、流式截断等**语法级**错误，导致扩展在严格 `JSON.parse` 阶段失败，整批工具不执行。

历史上解析失败会把 call 块替换为带 `INVALID_JSON` 的 `<virtual-tool-result>`，同一条消息内难以直接改正后重试。本迭代采用**单一语义**：凡因 JSON 无法进入执行（含严格解析失败、拒绝修复、修复失败）均**保留** `<virtual-tool-call>`，不写失败型 result；仅在解析成功（含高把握自动修复后）才执行并替换为 result。

## 目标（含成功指标）

### 业务目标

- 在「JSON 自动修复」开启时（默认开启），显著减少因**可安全判定为语法/结构问题**导致的不可执行批次，使本可执行的 VFS 操作得以完成。
- 对无法高把握修复的载荷**不强行执行**，并保留 call 块供编辑重试。
- **不再**因消息通道 JSON 解析失败而消费 call 块（与旧版 `INVALID_JSON` 写回 result 的行为脱钩）。

### 成功指标（可观测、验收期衡量）

| 指标 | 说明 |
|------|------|
| **可执行率提升** | 在默认配置下，原先因少 `}`、尾逗号等可修结构问题而失败的批次，应能进入 `executeBatch`；上线后根据日志抽样定标。 |
| **误执行可控** | 保守策略下，不对「长 `content` 内未闭合字符串、语义不确定截断」等场景自动执行；**零** blocker 级「明显错 path / 错内容仍执行」案例。 |
| **可恢复性** | 凡未进入执行的解析路径，消息仍含可编辑的 `<virtual-tool-call>`。 |

## 用户与场景

| 用户 | 场景 |
|------|------|
| **与 ST 对话的作者 / 角色卡维护者** | 模型在回复里写入虚拟工具调用，因少 `}`、多逗号等格式问题整批失败。 |
| **调试虚拟工作流的开发者** | 区分「协议/业务失败」与「JSON 未进执行」，并在同条消息里改 JSON 后重跑。 |

**典型场景**：`write` / `replace` 调用在 `calls` 外层少闭合括号 → 自动补全并执行；`content` 内无法可靠闭合 → 不执行，call 保留。

## 范围

### 包含范围

1. **仅消息通道**：`<virtual-tool-call>…</virtual-tool-call>` 内 JSON 的解析与可选修复；不涉及 Function Calling（`vfs_*`）。
2. **保守修复策略**：仅对高把握结构/语法问题尝试修复；低把握场景拒绝执行。
3. **独立开关** `virtualToolJsonRepairEnabled`（**默认开**）：仅控制**是否尝试**自动修复；**不**改变「解析未成功 → 保留 call」的统一失败语义。
4. **修复/解析成功**：按现有批次语义执行，call 替换为 `<virtual-tool-result>`。
5. **解析未成功**（strict 失败、拒绝修复、修复失败）：保留 call，不写 `INVALID_JSON` 类 result；记录可观测日志（跳过原因）。
6. **可审计**：经自动修复并成功执行时，result 或日志中可识别「曾自动修复」。

### 不包含范围

- FC 参数修复、工具语义/原子性/checkpoint 变更、result 标签内容修复、二次 LLM 猜 JSON。
- 削弱「多 result 拒绝」「最后一段 call 生效」等一致性规则。

## 核心需求（3-7 条）

1. **减少格式导致的执行失败**：默认开启修复时，对符合保守策略的坏 JSON 修复后进入 `executeBatch`。
2. **保守优先于覆盖率**：低把握载荷不修、不执行。
3. **统一失败语义**：消息通道 JSON 未进入执行时，一律保留 call、不写入失败 result；开关只关「修复尝试」，不关此语义。
4. **失败可重试**：用户/模型可在同条消息内改 JSON 后再次触发。
5. **成功可审计**：修复后成功执行可区分于普通成功。
6. **FC 不变**：`vfs_*` 不经过本解析/修复管线。

## 验收标准

### AC-1：高把握结构错误可执行（修复默认开）

- **Given** `virtualToolJsonRepairEnabled` 为**开**（默认），call 内 JSON 仅存在保守策略允许的缺陷（如少 `}`、尾逗号）
- **When** 触发虚拟工具处理
- **Then** 批次执行；call 替换为 result（`ok: true` 或业务失败，非解析拦截）；且可识别曾自动修复

### AC-2：低把握错误不执行且保留 call

- **Given** 修复**开**，缺陷属于拒绝修复类型（如 `content` 内未闭合引号、严重截断）
- **When** 触发处理
- **Then** 无 VFS 变更；消息仍含原 `<virtual-tool-call>`；无因本次解析失败写入的 `<virtual-tool-result>`

### AC-3：修复关 — strict 失败仍保留 call

- **Given** `virtualToolJsonRepairEnabled` 为**关**，JSON 无法 strict parse 且不具备直接执行条件
- **When** 触发处理
- **Then** 不尝试修复、不执行、保留 call；不写失败 result

### AC-4：修复后协议非法

- **Given** JSON 已 parse 成功
- **When** 不符合 `{ "calls": [ { "tool", "args": {} } ] }`
- **Then** 按 dispatcher 协议错误处理（写 result、消费 call，与现有批次失败语义一致）

### AC-5：FC 不受影响

- **Given** 仅 `vfs_*` Function Calling
- **When** 任意设置
- **Then** 不经过 JSON 自修复逻辑

### AC-6：一致性规则仍生效

- **Given** 多 `<virtual-tool-result>` 或无可执行 call
- **When** 触发处理
- **Then** 多 result 拒绝、最后 call 优先等规则不变

### AC-7：设置项可见

- **Given** 扩展设置页
- **When** 查看虚拟工具相关配置
- **Then** 有「JSON 自动修复」开关及说明（仅消息标签、保守策略、默认开启）

---

**文档路径**：`.apm/kb/docs/Iterations/VFS-Virtual-Tool-Json-Repair/prd.md`  
**对齐**：与 `spec.md` 干净方案一致；实现以 SPEC 为准。
