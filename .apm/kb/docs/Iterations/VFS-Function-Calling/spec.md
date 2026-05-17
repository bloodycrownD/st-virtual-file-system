# VFS Function Calling 技术规格（SPEC）

## 设计目标

- 在 **不复制 VFS 读写逻辑** 的前提下，通过 SillyTavern `registerFunctionTool` 暴露 7 个 `vfs_*` 工具。
- 与现有 `<virtual-tool-call>` 消息通道 **并存**，执行结果与 `ToolDispatcher` + `ChatVfsRuntime.executeBatch` 行为一致（含成功才落盘、post-commit checkpoint）。
- 注册门控与 PRD 一致：`extension.enabled` ∧ `virtualToolCallEnabled` ∧ `isToolCallingSupported()`（可选叠加 `canPerformToolCalls`）。
- 本迭代 **不改** 设置页 UI、不新增检查点/工作树类工具。

## 总体方案

### 现状（代码锚点）

| 模块 | 路径 | 职责 |
|------|------|------|
| 虚拟工具实现 | `src/app/services/virtual-tools/tools.ts` | `read`…`search` 七个 `VirtualTool`，`createDefaultVirtualTools()` |
| 批次调度 | `src/app/services/virtual-tools/tool-dispatcher.ts` | `executeEnvelope(envelope, vfs)`，fail-fast、maxCalls/timeout |
| 事务运行时 | `src/app/services/vfs-runtime/chat-vfs-runtime.ts` | `executeBatch`：working copy → 成功才 `updateChat` + checkpoint |
| 消息通道 | `src/app/services/message/virtual-tool-message-handler.ts` | 解析标签 → `runtime.executeBatch(..., logContext)` |
| 入口 | `src/main.ts` | 创建共享 `ToolDispatcher` / `ChatVfsRuntime`，无 function tool 注册 |
| ST 类型 | `global.d.ts` | 仅有 `registerMacro`，**无** `registerFunctionTool` 声明 |
| 扩展开关 | `vfs-extension-settings.schema.ts` | `enabled`、`virtualToolCallEnabled`（默认均为 `true`） |
| 消息门控 | `ChatVfsRuntime.isVirtualToolCallEnabled()` | **仅**读 `virtualToolCallEnabled`，未合并 `enabled` |

消息路径已在 `tests/tool-dispatcher-runtime.spec.ts`、`tests/message-pipeline-virtual-tool.spec.ts` 覆盖批次语义。

### 目标架构

```text
SillyTavern LLM (Function Calling)
        │ registerFunctionTool: vfs_read … vfs_search
        ▼
vfs-function-tool-registry.ts
        │ action(args) → 映射 vfs_* → 短名 read/write/…
        ▼
ChatVfsRuntime.executeBatch({ calls: [单条] })   // 无 logContext
        ▼
ToolDispatcher → VirtualTool.execute → VfsCore (chat snapshot)
```

- **注册策略**：扩展 `main.ts` 初始化完成后 **一次性** `registerFunctionTool` 七个定义；`shouldRegister` 在每轮生成前决定是否纳入工具列表。
- **注销策略**（满足 PRD「关闭/卸载时 unregister」）：
  - `beforeunload` 注销全部；
  - `vfsPersistenceStore.subscribe` 监听 `enabled` / `virtualToolCallEnabled`：从「允许」→「不允许」时 `unregisterFunctionTool`；从「不允许」→「允许」且 ST 支持时重新 `register`（避免仅依赖 shouldRegister 时工具定义仍常驻 ST 内部列表的实现差异）。
- **与消息通道差异**：Function Calling **不写** `chatVfsLogs`（无 `messageId`/`batchId`）；仍走 **同一套** snapshot + checkpoint 提交语义。

### 名称映射

| ST `name` | 内部 `tool`（dispatcher） |
|-----------|---------------------------|
| `vfs_read` | `read` |
| `vfs_write` | `write` |
| `vfs_append` | `append` |
| `vfs_delete` | `delete` |
| `vfs_replace` | `replace` |
| `vfs_list` | `list` |
| `vfs_search` | `search` |

## 最终项目结构

```text
src/infra/sillytarvern/function-tools/
  vfs-function-tool-schemas.ts      # 各工具 parameters JSON Schema + description 文案
  format-function-tool-result.ts    # ToolResultItem / batch → 返回 LLM 的 string
  vfs-function-tool-registry.ts     # register / unregister / shouldRegister / wire action

global.d.ts                         # 补充 ST function tool API 类型

src/main.ts                         # 初始化后调用 register；subscribe + beforeunload 注销

tests/vfs-function-tools-registry.spec.ts
```

不新增 `plan.md`；实现步骤见下文。

## 变更点清单

| 文件 | 变更 |
|------|------|
| `global.d.ts` | 为 `getContext()` 增加 `registerFunctionTool`、`unregisterFunctionTool`、`isToolCallingSupported`、`canPerformToolCalls?` 及工具定义类型 |
| `vfs-function-tool-schemas.ts` | **新建**：7 组 schema，字段与 `docs/Tools.md` 对齐（`$schema` draft-04，与 `docs/Toolcall.md` 示例一致） |
| `format-function-tool-result.ts` | **新建**：将 `ToolBatchExecutionResult` 转为稳定 JSON 字符串（含 `ok`、`summary`、`data`、`errorCode`） |
| `vfs-function-tool-registry.ts` | **新建**：`registerVfsFunctionTools(runtime, store)` / `unregisterVfsFunctionTools()` / 内部 `createToolDefinition` |
| `main.ts` | 在 `ChatVfsRuntime` 创建后注册；挂载 store 订阅与 `beforeunload` |
| `chat-vfs-runtime.ts` | **可选小改**：新增 `executeSingleTool(tool, args)` 薄封装（内部 `executeBatch` 单条），供 registry 调用，避免重复拼 envelope |
| `docs/Tools.md` / `README.md` | PRD 不要求本迭代修改；发布时可补一句「亦支持 ST Function Calling（vfs_*）」 |

**明确不改**：`App.vue`、工作树引擎、检查点 UI、`virtual-tool-message-handler` 标签解析逻辑（除非对齐 `enabled` 门控，见风险节）。

## 详细实现步骤

### 步骤 1：扩展 `global.d.ts`

定义最小可用类型（与 `docs/Toolcall.md` 字段表一致）：

```ts
interface FunctionToolDefinition {
  name: string
  displayName?: string
  description: string
  parameters: Record<string, unknown>
  action: (args: Record<string, unknown>) => Promise<string> | string
  formatMessage?: (args: Record<string, unknown>) => string
  shouldRegister?: () => boolean
  stealth?: boolean
}
```

`getContext()` 返回对象增加上述四个方法（`canPerformToolCalls` 标为可选）。

### 步骤 2：`vfs-function-tool-schemas.ts`

为每个工具导出：

- `description`：中文或中英简述，写明「仅当前聊天虚拟路径、以 `/` 开头」及何时使用（供 LLM 选型）。
- `parameters`：与 `Tools.md` 一致，例如：
  - `read`：`path` required；`startLine`/`endLine`/`maxLines`/`maxChars` optional number
  - `delete`：`recursive` boolean，强调仅 `true` 时递归删目录
  - `search`：`query`/`path`/`regex`
- `formatMessage` 文案模板：如 `正在读取 ${path}…`（registry 内闭包绑定）。

### 步骤 3：`format-function-tool-result.ts`

输入 `ToolBatchExecutionResult`，输出 **string**（`action` 硬性要求）：

```json
{
  "ok": true,
  "results": [
    { "tool": "read", "ok": true, "summary": "...", "data": { "content": "..." } }
  ]
}
```

失败时包含 `errorCode` / `errorMessage`（来自 dispatcher）。不抛未捕获异常；`action` 内 try/catch 返回 `{ "ok": false, "errorMessage": "..." }`。

### 步骤 4：`vfs-function-tool-registry.ts`

**`shouldRegisterVfsTools(store)`**：

```ts
if (typeof SillyTavern === 'undefined') return false
const ctx = SillyTavern.getContext()
if (!ctx.registerFunctionTool || !ctx.isToolCallingSupported?.()) return false
const ext = store.getState().extension
if (!ext.enabled || !ext.virtualToolCallEnabled) return false
if (ctx.canPerformToolCalls && !ctx.canPerformToolCalls('normal')) return false
return true
```

**`action`**（每个工具）：

1. 将 `vfs_*` 映射为短名。
2. `runtime.executeBatch({ calls: [{ tool, args: args ?? {} }] })`（不传 `logContext`）。
3. `return formatFunctionToolResult(batch)`。

**`registerVfsFunctionTools(runtime, store)`**：

- 若 `registerFunctionTool` 不存在则 no-op（旧版 ST 兼容）。
- 对 7 个 name 依次 `registerFunctionTool({ ..., shouldRegister: () => shouldRegisterVfsTools(store), stealth: false })`。
- 注册前对同名工具先 `unregisterFunctionTool`（幂等，防热重载重复）。

**`unregisterVfsFunctionTools()`**：对 7 个固定 name 调用 `unregisterFunctionTool`。

**`syncVfsFunctionToolRegistration(runtime, store)`**：

- `shouldRegisterVfsTools` 为 false → `unregisterVfsFunctionTools()`
- 为 true → `registerVfsFunctionTools`（内部先 unregister 再 register）

### 步骤 5：接线 `main.ts`

在现有 wiring 之后：

```ts
import { registerVfsFunctionTools, syncVfsFunctionToolRegistration, unregisterVfsFunctionTools } from '@/infra/sillytarvern/function-tools/vfs-function-tool-registry'

// … runtime 创建后 …
registerVfsFunctionTools(runtime, vfsPersistenceStore)
vfsPersistenceStore.subscribe(() => {
  syncVfsFunctionToolRegistration(runtime, vfsPersistenceStore)
})
window.addEventListener('beforeunload', () => unregisterVfsFunctionTools())
```

`initVfsPersistenceStore()` 须先于注册执行（`main.ts` 已满足）。

### 步骤 6（可选）：`ChatVfsRuntime.executeSingleTool`

```ts
executeSingleTool(tool: string, args: Record<string, unknown>): ToolBatchExecutionResult {
  return this.executeBatch({ calls: [{ tool, args }] })
}
```

registry 只调此方法，减少重复。

### 兼容性说明

- **ST 版本**：无 `registerFunctionTool` 时扩展其余功能不受影响（与 `registerVfsMacros` 的 `typeof SillyTavern` 守卫相同）。
- **消息标签**：逻辑不变；模型仍可在回复中写 `<virtual-tool-call>`。
- **门控差异**：实现后 Function Calling 同时要求 `enabled`；消息 handler 仍只查 `virtualToolCallEnabled`。若产品要求完全一致，可在 `isVirtualToolCallEnabled()` 中增加 `&& extension.enabled`（小改动，建议本迭代一并做，避免「扩展关闭但仍可 API 写盘」——若 `enabled` 仅 UI 语义则保持现状并在 SPEC 风险中记录）。

## 测试策略

### 单元 / 集成（Vitest，mock `SillyTavern`）

| ID | 用例 |
|----|------|
| T-FC-01 | mock `registerFunctionTool` / `unregisterFunctionTool`，`registerVfsFunctionTools` 调用 7 次，name 为 `vfs_*` |
| T-FC-02 | `shouldRegister`：`enabled=false` 或 `virtualToolCallEnabled=false` 时返回 false |
| T-FC-03 | `shouldRegister`：`isToolCallingSupported` 返回 false 时返回 false |
| T-FC-04 | `action`（`vfs_write`）：mock runtime，`executeBatch` 收到 `{ tool:'write', args:{ path, content } }`，返回 string 含 `ok:true` |
| T-FC-05 | `action` 失败路径：dispatcher 返回 `ok:false`，string 含 `errorCode` |
| T-FC-06 | `sync`：关闭 `virtualToolCallEnabled` 触发 `unregisterFunctionTool` ×7 |
| T-FC-07 | 与 `tool-dispatcher-runtime.spec.ts` 对照：同一 store 上 FC `vfs_read` 与 `executeBatch({ tool:'read' })` 读到的 `content` 一致 |

不依赖真实 ST 聊天 UI；E2E 由用户在 ST 内开启 Function Calling 后手工抽测（见 PRD 验收）。

### 测试文件

- 新建 `tests/vfs-function-tools-registry.spec.ts`
- 复用 `createAdapterMock()` 模式（见 `tool-dispatcher-runtime.spec.ts`）

## 风险与回滚方案

| 风险 | 缓解 |
|------|------|
| `global.d.ts` 与真实 ST API 漂移 | 以 `docs/Toolcall.md` 为准；运行时 `?.` 可选链 |
| 热重载 / 重复注册 | 每次 register 前先 unregister 同名 |
| `enabled` 与 `virtualToolCallEnabled` 消息/API 不一致 | 建议统一 `isVirtualToolCallEnabled()`；或文档说明 |
| FC 无 message 日志，排障依赖 ST 聊天内 tool 记录 | `stealth=false` + 清晰 `formatMessage` / 返回 JSON |
| LLM 不调用工具 | 产品层行为，非扩展缺陷 |
| 并发：FC 与消息标签同时写 | `executeBatch` 顺序提交；极端竞态依赖 ST 串行工具调用，与现有多消息标签相同 |

**回滚**：删除 `function-tools/` 目录、`main.ts` 三行接线；`unregisterVfsFunctionTools()` 在回滚提交前执行一次即可清理 ST 侧注册。

---

请确认本 SPEC 后再进入编码。若需调整（例如：FC 也写入 `chatVfsLogs`、或强制对齐 `enabled` 门控），确认时一并说明。

---

## 后续变更记录

| 日期 | 文档 | 摘要 |
|------|------|------|
| 2026-05 | [VFS-Virtual-Tools-Evolutions/prd.md](./VFS-Virtual-Tools-Evolutions/prd.md) | 新增 `replace`、移除 `update`；失败时 result/FC 返回完整 `args` |
| 2026-05 | [VFS-Virtual-Tools-Evolutions/spec.md](./VFS-Virtual-Tools-Evolutions/spec.md) | 实现锚点、序列化规则、测试与回滚说明 |

**当前工具映射**以本文「名称映射」表为准（`vfs_replace`，无 `vfs_update`）。`format-function-tool-result.ts` 在失败路径通过 `tool-result-payload.ts` 的 `buildResultCallsDisplay` 输出完整 `args`。
