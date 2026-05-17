# VFS 虚拟工具演进 技术规格（SPEC / 更改记录）

> 实现状态：**已合入**（与 `replace` 工具、失败入参展示同期落地）。  
> 关联：`docs/Tools.md`、`Iterations/VFS-Function-Calling/spec.md`。

## 1. `replace` 工具

### 语义

| 参数 | 必填 | 说明 |
|------|------|------|
| `path` | 是 | 虚拟路径 |
| `oldContent` | 是，非空 | 须在文件中**精确匹配**（含空格、换行） |
| `newContent` | 是 | 替换内容；`""` 表示删除该片段 |
| `replaceAll` | 否 | 默认 `false`：仅允许 1 处匹配；`true` 替换全部 |

### 错误码（抛出 → `TOOL_EXECUTION_FAILED`）

| 条件 | `errorMessage` 要点 |
|------|---------------------|
| `oldContent` 缺失或空 | `oldContent must be a non-empty string` |
| 未找到 | `oldContent not found` |
| 多处匹配且未 `replaceAll` | `oldContent is not unique; set replaceAll=true…` |

### 代码锚点

- `src/app/services/virtual-tools/tools.ts` — `replaceTool`、`createDefaultVirtualTools()`
- `src/infra/sillytarvern/function-tools/vfs-function-tool-schemas.ts` — `vfs_replace`
- `tests/virtual-tools-replace.spec.ts`

## 2. 移除 `update`

| 项 | 说明 |
|----|------|
| 删除 | `updateTool` 及 `vfs_update` schema |
| 破坏性 | 旧消息 / 旧 prompt 中 `"tool":"update"` → `UNKNOWN_TOOL` |
| 替代 | 用 `replace`；整段重写仍用 `write` |

**不再保留**行号 + `expectedOldContent` 组合（原 `update` 语义）。

## 3. 失败时 `calls` 展示完整入参

### 规则

```text
buildResultCallsDisplay(calls, includeFullArgs = !batch.ok)
```

| `batch.ok` | `calls[i]` 形态 |
|------------|-----------------|
| `true` | `{ tool, argsSummary: "path,content,…" }`（最多 4 个键名，逗号连接） |
| `false` | `{ tool, args: { …完整对象 } }` |
| JSON 解析失败 | `{ tool: "(parse-error)", args: { callContent: "<原始 call JSON>" } }` |

`results[]` 结构不变；`errorCode` / `errorMessage` 仍在批次顶层。

### 代码锚点

| 模块 | 路径 |
|------|------|
| 共享序列化 | `src/app/services/virtual-tools/tool-result-payload.ts` |
| 消息标签 | `src/app/services/message/virtual-tool-message-handler.ts` |
| Function Calling | `src/infra/sillytarvern/function-tools/format-function-tool-result.ts` |
| FC 接线 | `src/infra/sillytarvern/function-tools/vfs-function-tool-registry.ts`（`formatFunctionToolResult(batch, { calls })`） |

### 示例（失败）

```json
{
  "ok": false,
  "calls": [
    {
      "tool": "replace",
      "args": {
        "path": "/story/ch1.txt",
        "oldContent": "不存在的句子",
        "newContent": "新句子"
      }
    }
  ],
  "results": [],
  "errorCode": "TOOL_EXECUTION_FAILED",
  "errorMessage": "oldContent not found"
}
```

### 测试

| 文件 | 覆盖 |
|------|------|
| `tests/tool-result-payload.spec.ts` | `buildResultCallsDisplay`、FC JSON |
| `tests/virtual-tool-message-result.spec.ts` | 消息标签失败批次 |
| `tests/virtual-tool-cr-loop.spec.ts` | `replace` 缺参失败（原 `update` 用例已改） |

## 4. Function Calling 工具表（当前）

| ST `name` | 内部 `tool` |
|-----------|-------------|
| `vfs_read` | `read` |
| `vfs_write` | `write` |
| `vfs_append` | `append` |
| `vfs_delete` | `delete` |
| `vfs_replace` | `replace` |
| `vfs_list` | `list` |
| `vfs_search` | `search` |

## 5. 变更文件清单（本迭代）

| 文件 | 变更类型 |
|------|----------|
| `tools.ts` | +`replaceTool`，−`updateTool` |
| `vfs-function-tool-schemas.ts` | +`vfs_replace`，−`vfs_update` |
| `tool-result-payload.ts` | 新建 |
| `format-function-tool-result.ts` | 失败时 `calls` 含 `args` |
| `virtual-tool-message-handler.ts` | 同上；INVALID_JSON 带 `callContent` |
| `vfs-function-tool-registry.ts` | 传入 `calls` 上下文 |
| `docs/Tools.md` | `replace` 说明；结果 `calls` 失败形态 |
| `Iterations/VFS-Function-Calling/prd.md` | 工具名 `update`→`replace`（前文已改） |
| `Iterations/VFS-Function-Calling/spec.md` | 名称映射表（前文已改） |

## 6. 风险与回滚

| 风险 | 缓解 |
|------|------|
| 历史 `update` 调用失效 | 文档与更改记录标明破坏性；改用 `replace` |
| 失败 result 体积变大 | 仅 `ok:false` 展开 `args`；成功仍摘要 |
| `oldContent` 过短导致误匹配多处 | 默认唯一匹配；文档要求加长锚点 |

**回滚**：恢复 `updateTool` 与 `vfs_update`；`virtual-tool-message-handler` 改回始终 `argsSummary`（需同步回滚 `tool-result-payload`）。
