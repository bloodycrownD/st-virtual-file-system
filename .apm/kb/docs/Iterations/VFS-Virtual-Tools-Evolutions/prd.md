# VFS 虚拟工具演进 PRD（更改记录）

> 本文档记录 **v1.0.7 之后** 对虚拟工具协议与 Function Calling 的增量变更，不替代原迭代 `VFS-Function-Calling` 的初版 PRD。

## 背景

1. **`update` 工具难用**：需 `startLine` / `endLine` / `expectedOldContent` / `newContent` 五个字段，与「在文件中间改一段字」的常见意图重叠，且行号易因软换行、前文增删而漂移。
2. **失败难排查**：`<virtual-tool-result>` 与 FC 返回 JSON 中，`calls` 仅含 `argsSummary`（参数名列表），执行失败时看不到模型实际传入的完整入参。

## 目标

| 编号 | 目标 |
|------|------|
| E-1 | 新增 **`replace`**：按 `oldContent` → `newContent` 做精确片段替换（类编辑器查找替换），作为局部修改的默认方式。 |
| E-2 | **移除 `update`**：不再注册 `vfs_update`，消息标签中 `tool:"update"` 视为未知工具（破坏性变更，接受）。 |
| E-3 | **失败时展示完整入参**：`ok:false` 时 `calls[]` 每项带完整 `args`；成功时仍仅 `argsSummary`，避免重复泄露大段 `read` 正文。 |

## 范围

### 包含

- 虚拟工具实现：`replace`（`replaceAll` 可选）。
- `docs/Tools.md` 使用者说明同步。
- 消息通道 `<virtual-tool-result>` 与 FC `action` 返回 JSON 的 `calls` 序列化规则。
- 七工具 FC 注册表仍为 7 个：`vfs_replace` 替代原 `vfs_update`。

### 不包含

- 自动把历史消息里的 `update` 调用迁移为 `replace`（无 shim）。
- 成功路径在 `calls` 中附带完整 `args`（仍用 `argsSummary`）。

## 用户与场景

| 用户 | 场景 |
|------|------|
| 模型 / 工作流作者 | 改一段剧情：`replace` + 足够长的 `oldContent` 锚点，无需数行号 |
| 排错 | 工具报错后从 result JSON 直接看到当时传入的 `path`、`oldContent` 等 |
| 旧对话 | 仍含 `update` 的调用块会失败并提示 `UNKNOWN_TOOL`，需改写成 `replace` 或 `write` |

## 验收标准

- **Given** 文件中存在唯一子串 `beta`  
  **When** `replace` 且 `oldContent:"beta"`、`newContent:"BETA"`  
  **Then** 该处被替换且 `ok:true`。

- **Given** `oldContent` 在文件中出现 2 次且未设 `replaceAll`  
  **When** 调用 `replace`  
  **Then** 失败，错误信息提示非唯一匹配。

- **Given** 批次中某步失败  
  **When** 查看 `<virtual-tool-result>` 或 FC 返回  
  **Then** `calls` 中对应项含完整 `args` 对象（非仅键名摘要）。

- **Given** 消息含 `"tool":"update"`  
  **When** 执行虚拟工具批次  
  **Then** `UNKNOWN_TOOL`（或等价错误），不静默成功。

## 与初版 PRD 的关系

- 初版 `VFS-Function-Calling` PRD 中的 7 工具列表以 **`vfs_replace` 替换 `vfs_update`** 为准；其余目标（双通道、门控、共享 dispatcher）不变。
- 技术细节见同目录 `spec.md`。
