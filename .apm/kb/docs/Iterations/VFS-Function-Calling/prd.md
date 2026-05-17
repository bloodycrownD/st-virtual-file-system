# VFS Function Calling（registerFunctionTool）PRD

## 背景

本扩展已在聊天消息内支持 `<virtual-tool-call>` 协议（见 `docs/Tools.md`），可在消息落库后批量执行 `read` / `write` / `append` / `delete` / `replace` / `list` / `search` 等虚拟文件操作。

SillyTavern 另提供基于 Chat Completion API 的 **Function Calling** 能力（见 `docs/Toolcall.md`）：扩展可通过 `registerFunctionTool` 向 LLM 暴露结构化工具，由模型在受支持的生成流程中主动调用。

当前扩展**尚未**向 ST 注册任何 function tool，模型无法通过 API 工具调用直接操作当前聊天的虚拟文件系统。用户希望在保留现有消息标签能力的前提下，补齐 ST 原生工具调用通道，并与现有 VFS 执行逻辑共用。

## 目标（含成功指标）

1. **能力对齐**：在 ST 已启用 Function Calling 且扩展允许虚拟工具时，向 ST 注册 **7 个**带 `vfs_` 前缀的 function tool，参数语义与 `docs/Tools.md` 中现有工具一致。
2. **执行一致**：Function Calling 的 `action` 与消息标签路径共用同一套 chat 作用域 VFS 与工具实现（同一 dispatcher / 同一安全上限），避免双轨行为漂移。
3. **可观测**：默认 `stealth=false`，调用过程可有 toast（`formatMessage`），结果以字符串形式返回 LLM，并按 ST 规则进入可见聊天历史。
4. **可度量成功**：
   - 满足注册条件时，ST 工具列表中可见 7 个 `vfs_*` 工具；条件不满足时均不可见。
   - 对当前聊天 VFS 中已知路径执行 `vfs_read` / `vfs_write` 等，结果与 UI/消息标签路径一致。
   - 同一条聊天中，消息内 `<virtual-tool-call>` 仍可按原规则执行，互不替代。
   - 扩展卸载或关闭虚拟工具开关后，已注册工具从 ST 注销，不再被 LLM 调用。

## 用户与场景

| 用户 | 场景 |
|------|------|
| 使用 Chat Completion 且开启 Function Calling 的 ST 用户 | 在对话中让模型直接读/写当前聊天的虚拟文件，无需手写 `<virtual-tool-call>` JSON |
| 仍使用消息标签协议的用户 / 工作流 | 继续在 assistant 消息里嵌入调用块，行为不变 |
| 扩展维护者 | 新增工具时只需扩展一套 virtual tool 实现，并同步注册 function tool 定义 |

## 范围

### 包含范围

- 在扩展启动/就绪时，按条件调用 `registerFunctionTool` 注册 7 个工具：`vfs_read`、`vfs_write`、`vfs_append`、`vfs_delete`、`vfs_replace`、`vfs_list`、`vfs_search`。
- 各工具 `description` / `parameters`（JSON Schema）与 `docs/Tools.md` 对齐，便于 LLM 正确填参。
- `shouldRegister`：扩展 `enabled=true` **且** `virtualToolCallEnabled=true` **且** ST 侧 `isToolCallingSupported()` 为真（实现阶段可按需叠加 `canPerformToolCalls` 判断）。
- `action` 内调用现有 virtual tool 执行链路，将 `ToolResultItem` 序列化为返回给 LLM 的字符串（成功/失败信息清晰可读）。
- 扩展卸载或虚拟工具关闭时，对 7 个 `name` 调用 `unregisterFunctionTool`。
- 默认 `stealth=false`；可提供简短 `formatMessage`（如「正在读取 /foo.md…」）。

### 不包含范围

- **检查点 / 回滚** 类 function tools。
- **工作树 / 目录规则配置** 类 function tools。
- **文件管理弹窗 UI** 改动（设置页、列表、预览等）。
- **本 PRD 阶段不强制** 更新 `docs/Tools.md`、`README.md`（可在实现/发布阶段另补使用者说明）。
- 不改造 ST 全局「Enable function calling」开关逻辑；不保证所有模型一定会调用工具。
- 不改变消息标签协议的批次上限（单消息最多 10 条、总超时等）——Function Calling 按 ST 单次单工具语义执行即可。

## 核心需求

1. **注册与注销生命周期**：扩展初始化完成后注册；`virtualToolCallEnabled` 或 `enabled` 变为 false、或扩展 dispose 时注销对应工具。
2. **七工具全覆盖**：7 个 `vfs_*` 工具与现有 virtual tool 一一映射，参数校验与安全上限（如 read 行数/字符上限、delete 的 `recursive` 等）与消息路径一致。
3. **共享执行内核**：禁止为 Function Calling 单独复制一套读写实现；必须通过现有 `ToolDispatcher` + chat VFS runtime 执行。
4. **注册门控**：未满足「扩展启用 + 虚拟工具开关 + ST 支持」时，工具不得出现在当前请求的工具列表中（`shouldRegister` 返回 false）。
5. **结果格式**：`action` 必须返回 string；失败时返回含错误码/摘要的可解析文本，便于 LLM 重试或向用户说明。
6. **并存**：不削弱、不替换 `<virtual-tool-call>`；两条通道可同时存在于同一聊天。
7. **命名隔离**：对外 `name` 使用 `vfs_` 前缀，避免与其它扩展的 `read`/`write` 冲突；消息标签内 `tool` 字段仍保持现有短名。

## 验收标准

### 注册与可见性

- **Given** 扩展 `enabled=true`、`virtualToolCallEnabled=true`，且当前 ST API 支持并已开启 Function Calling  
  **When** 扩展完成加载  
  **Then** ST 侧可发现 7 个 `vfs_*` 工具，且 `description` 非空。

- **Given** `virtualToolCallEnabled=false`（或扩展 `enabled=false`）  
  **When** 发起新一轮支持工具调用的生成  
  **Then** 7 个 `vfs_*` 工具不在当前请求工具列表中。

- **Given** 扩展曾注册工具  
  **When** 关闭虚拟工具开关或卸载扩展  
  **Then** 对应 `unregisterFunctionTool` 已执行，后续生成不再出现这些工具。

### 执行正确性（抽样）

- **Given** 当前聊天 VFS 存在 `/notes/a.txt` 内容为 `hello`  
  **When** LLM 调用 `vfs_read` 且 `path="/notes/a.txt"`  
  **Then** 返回字符串包含 `hello`，且与通过 `<virtual-tool-call>` 执行 `read` 的结果一致。

- **Given** 空路径或非法 JSON 参数  
  **When** LLM 调用任一 `vfs_*`  
  **Then** 返回失败说明（含可辨识错误信息），不破坏 VFS 其它文件；不导致扩展崩溃。

- **Given** `vfs_delete` 且 `recursive` 不为 `true`  
  **When** 目标为非空目录  
  **Then** 行为与 `Tools.md` 一致（拒绝递归误删）。

### 并存与开关

- **Given** Function Calling 与消息标签均可用  
  **When** 同聊天内分别用 API 工具与 `<virtual-tool-call>` 各执行一次 `write`  
  **Then** 两次写入均作用于同一 chat VFS，后读可见两次变更。

- **Given** 仅关闭 `virtualToolCallEnabled`  
  **When** 用户发送含 `<virtual-tool-call>` 的消息  
  **Then** 消息标签不执行（保持现有行为）；且 `vfs_*` 未注册。

### 体验（默认可见）

- **Given** 成功调用 `vfs_write`  
  **When** 工具执行完成  
  **Then** `stealth=false`，ST 聊天记录中可见该次工具调用记录（符合 Toolcall.md 默认行为）。

---

## 后续变更记录

| 日期 | 文档 | 摘要 |
|------|------|------|
| 2026-05 | [VFS-Virtual-Tools-Evolutions/prd.md](./VFS-Virtual-Tools-Evolutions/prd.md) | 虚拟工具：`replace` 替代 `update`；失败结果展示完整入参 |

初版 PRD 背景中的工具列表以 **`replace` 替代 `update`** 为准；详见演进 PRD/SPEC。
