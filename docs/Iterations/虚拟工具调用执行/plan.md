# 虚拟工具调用执行 设计方案

## 设计目标

- 在 `st-virtual-file-system` 内实现消息驱动的虚拟工具调用执行链路。
- 保证批量工具调用的原子性（内存执行成功后一次持久化）。
- 提供 chat 级日志系统、chat 级版本管理、extension 级模板 VFS。
- 保持与现有 `event adapter + store + persistence schema` 风格一致，避免侵入式重构。

## 总体方案

采用“事件入口 -> 调度执行 -> 结果回写 -> 持久化/日志/版本”的分层设计：

1. **事件入口层（infra/sillytarvern/events）**
   - 复用现有消息事件适配器订阅 `MESSAGE_RECEIVED` / `MESSAGE_EDITED`。
   - 将消息 id 交给“虚拟工具消息处理器”。

2. **消息处理层（app/services/message）**
   - 提取最后一个 `<virtual-tool-call>` 块。
   - 校验 `<virtual-tool-result>` 标签唯一性（多于一个即报错）。
   - 解析固定 schema：`{ "calls": [...] }`。
   - 执行完成后将 call 块原子替换为 result 块。

3. **工具执行层（app/services/virtual-tools）**
   - 提供 `read/write/delete/update/append/list/search` 工具注册与调度。
   - 在 chat 工作副本上按顺序执行，失败立即终止。
   - 多次 `update` 采用串行状态传递（后者读取前者修改后的副本）。

4. **事务与持久化层（app/services/vfs-runtime）**
   - 每批次先基于当前 chat VFS 建立内存工作副本。
   - 全部成功后一次性写回 chatMetadata（原子提交）。
   - 失败则丢弃工作副本，实现“自然回滚”。

5. **日志与版本层（app/services/vfs-log / vfs-version）**
   - chat 级日志：容量上限（默认 1MB，可配置），无 TTL，支持手动清理。
   - chat 级版本：工具批次成功提交一次 commit；人工保存也提交一次 commit。

6. **双层 VFS 与模板层（app/services/vfs-template）**
   - extension VFS 存在于 extensionSettings，仅人工维护。
   - chat 首次访问 VFS 时自动模板克隆（幂等）。
   - 支持手动“模板覆盖 chat VFS”（覆盖前自动做版本快照）。

## 最终项目结构

```text
src/
  app/
    services/
      message/
        virtual-tool-message-handler.ts
        virtual-tool-tag-manager.ts
      virtual-tools/
        tool-contracts.ts
        tool-dispatcher.ts
        tools/
          read-tool.ts
          write-tool.ts
          delete-tool.ts
          update-tool.ts
          append-tool.ts
          list-tool.ts
          search-tool.ts
      vfs-runtime/
        chat-vfs-runtime.ts
        extension-vfs-template-service.ts
      vfs-log/
        chat-vfs-log-service.ts
        chat-vfs-log.schema.ts
      vfs-version/
        chat-vfs-version-service.ts
        chat-vfs-version.schema.ts
  infra/
    persistence/
      vfs-chat-metadata.schema.ts          # 扩展 chat 级结构
      vfs-extension-settings.schema.ts     # 扩展 extension 级结构
  test/
    virtual-tools/
      virtual-tool-message-handler.spec.ts
      virtual-tool-dispatcher.spec.ts
      update-serial-state.spec.ts
      chat-vfs-log.spec.ts
      chat-vfs-version.spec.ts
      template-clone.spec.ts
```

## 变更点清单

1. **消息标签处理规则落地**
   - 提取最后一个 `<virtual-tool-call>`。
   - 原子替换为 `<virtual-tool-result>`。
   - 多 `<virtual-tool-result>` 检测并拒绝执行。

2. **固定 JSON 协议解析**
   - 仅接受 `{ calls: [...] }`。
   - 调用数限制 10，整批超时 5s。

3. **工具系统落地**
   - 抽象 `VirtualTool` 接口 + 工具注册表 + 调度器。
   - 七个工具全部实现到 chat VFS。

4. **原子执行策略落地**
   - 使用“工作副本 -> 成功一次持久化”。
   - 失败即终止，丢弃副本。

5. **日志系统落地**
   - 结构化日志字段固定。
   - 容量裁剪（默认 1MB，可配置）+ 手动清理接口。

6. **版本系统落地**
   - tool/manual 两类 commit 统一模型。
   - 模板覆盖前自动提交快照 commit。

7. **双层 VFS 生效域**
   - chat VFS：tool + log + version + persistence。
   - extension VFS：template only（人工维护、无 tool、无版本）。

## 详细实现步骤

### 第 1 步：扩展持久化 schema（chat / extension）

- 在 `vfs-chat-metadata.schema.ts` 中增加：
  - `chatVfsSnapshot`
  - `chatVfsLogs`
  - `chatVfsVersions`
  - `templateInitialized`（幂等标记）
- 在 `vfs-extension-settings.schema.ts` 中增加：
  - `extensionTemplateVfsSnapshot`
  - `logMaxBytes`（默认 1MB，可配置）
- 验证：parse/serialize 往返稳定，不破坏旧字段兼容。

### 第 2 步：实现虚拟工具消息标签管理

- 新建 `virtual-tool-tag-manager.ts`：
  - `extractLastCallBlock(message)`
  - `validateSingleResultTag(message)`
  - `replaceCallWithResult(message, resultJson)`
- 验证：标签边界和“最后一个 call”提取正确。

### 第 3 步：实现工具协议与调度器

- 新建 `tool-contracts.ts` 定义：
  - `ToolCallEnvelope`
  - `ToolCallItem`
  - `ToolResultItem`
  - `ToolExecutionContext`
- 新建 `tool-dispatcher.ts`：
  - 工具查找、参数校验、顺序执行、超时控制（整批 5s）。
- 验证：非法工具、非法 schema、超限调用数都可拒绝。

### 第 4 步：实现七个工具

- `read`：支持范围读取，默认 500 行 + 20k 字符截断。
- `write`：自动创建父目录。
- `delete`：目录删除需 `recursive=true`。
- `update`：行信息 + `expected old content` 强校验。
- `append`：末尾追加。
- `list`：目录列举。
- `search`：默认 case-insensitive 子串，可选 regex。
- 验证：逐工具单测 + 边界参数测试。

### 第 5 步：实现 chat VFS 事务运行时

- 新建 `chat-vfs-runtime.ts`：
  - 从 chatMetadata 加载当前快照为工作副本。
  - 在工作副本执行整批工具。
  - 成功后一次性写回 chatMetadata 并保存。
- 验证：任意中间失败后原 chat 状态不变。

### 第 6 步：实现日志系统（chat 级）

- 新建 `chat-vfs-log.schema.ts` + `chat-vfs-log-service.ts`：
  - 结构化日志追加、查询、容量裁剪、清理。
  - 容量按“每 chat”维度计算，默认 1MB（从配置读取）。
- 验证：超限后最旧日志被淘汰，查询仍可用。

### 第 7 步：实现版本系统（chat 级）

- 新建 `chat-vfs-version.schema.ts` + `chat-vfs-version-service.ts`：
  - `commitByToolBatch(...)`
  - `commitByManualSave(...)`
  - `listCommits(...)`
- 模板覆盖前自动提交一条“pre-template-overwrite” commit。
- 验证：tool/manual 均可生成 commit，字段完整。

### 第 8 步：实现 extension 模板克隆

- 新建 `extension-vfs-template-service.ts`：
  - 首次访问 chat VFS 时自动克隆 extension 模板（幂等）。
  - 手动触发覆盖流程（含覆盖前版本快照）。
- 验证：重复首次访问不会重复克隆；手动覆盖生效且可回退。

### 第 9 步：接线消息事件与入口初始化

- 在 `main.ts` 中初始化虚拟工具消息处理器。
- 通过现有 `st-event-adapter` 接入消息事件回调。
- 验证：MESSAGE_RECEIVED / MESSAGE_EDITED 都可触发，且并发锁生效。

### 第 10 步：补齐测试与验收脚本

- 新增测试覆盖：
  - 标签解析/替换
  - 多 result 标签报错
  - 批量原子回滚
  - update 串行状态传递
  - read 限制
  - 日志裁剪与清理
  - 版本提交
  - 模板克隆与覆盖
- 运行 `npm run test:run`、`npm run build` 作为验收门槛。

## 测试策略

- **单元测试**
  - 标签处理、schema 校验、工具行为、日志裁剪、版本模型。
- **集成测试**
  - 消息输入 -> 调度执行 -> 结果标签写回 -> chat 持久化链路。
- **回归测试**
  - 多次 update 串行状态传递、失败回滚、并发重复触发防护。

### 测试用例

1. 消息含单个 call 标签，执行成功并原子替换为 result 标签。
2. 消息含多个 result 标签时拒绝执行并写日志。
3. 批量调用中第 3 个工具失败，前 2 个改动最终不落盘。
4. 同文件连续两次 update，后者读取前者修改后内容。
5. read 默认限制生效（500 行 / 20k 字符）。
6. delete 目录无 `recursive=true` 时失败。
7. 日志超过容量后自动淘汰最旧记录。
8. tool 执行成功与 manual 保存都产生 commit。
9. 首次访问自动模板克隆；再次访问不重复克隆；手动覆盖成功。

## 风险与回滚方案

- **风险：消息标签处理误伤正文**
  - 方案：严格“最后一个 call 块”定位 + 替换单元测试保护。
- **风险：5 秒超时导致大批次误失败**
  - 方案：调用上限 10 + 结果摘要提示；配置可调并保留默认值。
- **风险：日志裁剪造成调试信息丢失**
  - 方案：结构化摘要优先保留关键信息；支持手动导出再清理。
- **风险：模板覆盖误操作**
  - 方案：覆盖前自动生成版本快照，允许人工回退。

回滚策略：

- 功能开关：在 extension 设置增加 `virtualToolCallEnabled`，出现问题可快速关闭执行链路。
- 数据回滚：通过 chat 版本记录回滚到覆盖前或批次前 commit。
