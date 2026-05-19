# VFS 虚拟工具调用 JSON 自修复 技术规格（SPEC）

## 设计目标

- 在**仅消息标签通道**（`<virtual-tool-call>...</virtual-tool-call>`）引入 JSON 自修复能力，降低 `INVALID_JSON` 导致的不可执行批次。
- 严格遵循 PRD 的**保守策略**：仅修复高把握结构/语法问题；低把握问题不执行。
- 引入**独立设置开关**，与 `virtualToolCallEnabled` 解耦。
- 保持现有关键约束不变：最后 call 生效、最多一个 result 标签、批次原子提交、FC 通道不受影响。
- 采用**单一干净语义**：解析失败（含不修复、拒绝修复）默认保留 call 块，不再为了兼容旧行为保留额外分支。

## 总体方案

### 现状约束（基于代码）

1. `VirtualToolMessageHandler.process` 当前直接 `JSON.parse(callBlock.content)`，解析失败会：
   - 记录日志 `INVALID_JSON`
   - 将 call 替换为 `<virtual-tool-result>`
   - 返回 `handled: true`
2. `ToolDispatcher` 已负责协议边界校验（`calls[]`、`args` 对象、maxCalls、timeout）与 fail-fast；不应在本次重复实现。
3. 扩展全局设置目前已有：
   - `enabled`
   - `virtualToolCallEnabled`
   - `snapshotMaxCount`、`logMaxBytes`
4. 设置 UI 当前位于 `App.vue`，尚无 JSON 自修复单独开关。

### 新增能力设计

在消息处理层引入“解析管线”：

```text
extractLastCallBlock
   -> parseToolCallEnvelope(callText, { repairEnabled })
      -> strict JSON.parse 成功：直接返回 envelope
      -> strict 失败且 repairEnabled=false：返回 parse-failed(strict)
      -> strict 失败且 repairEnabled=true：
           - 先做保守可修性判定（是否结构性、非低把握场景）
           - 尝试 repair + parse
           - 成功：返回 repaired envelope + repair metadata
           - 失败/拒绝：返回 non-repairable / repair-failed
   -> VirtualToolMessageHandler 根据 parse 结果决定：
      a) parsed/repaired：继续 executeBatch（原语义不变）
      b) strict-failed：不替换消息，返回 handled=false
      c) non-repairable/repair-failed：不替换消息，返回 handled=false
```

### 保守修复策略（首版）

**允许自动修复并执行**（高把握）：
- 外层结构闭合缺失（`}`/`]`）且可由括号栈在末尾补齐；
- 尾逗号（对象/数组末尾）；
- 其他不改变字符串内容语义的结构层修正（仅在解析器明确可判定时）。

**拒绝自动修复**（低把握）：
- 字符串字面量未闭合、疑似被截断（尤其 `content`/`oldContent` 等文本参数）；
- 需要猜测字符串内部内容或跨段重排；
- 修复会改变 key/value 语义而非纯结构闭合。

> 说明：具体“可修类型枚举 + 判断规则”由 `json-repair-policy.ts` 明确为可测试规则，而非散落在 handler 中。

## 最终项目结构

```text
.apm/kb/docs/Iterations/VFS-Virtual-Tool-Json-Repair/
  prd.md
  spec.md

src/
  app/services/message/
    virtual-tool-message-handler.ts           # 接入解析管线 + 分支行为
    virtual-tool-call-parser.ts               # 新增：严格解析 + 修复尝试统一入口
    json-repair-policy.ts                     # 新增：保守可修判定与原因码
  infra/persistence/
    vfs-extension-settings.schema.ts          # 新增 extension 配置字段
  App.vue                                     # 设置页新增“JSON 自动修复”开关

tests/
  virtual-tool-json-repair.spec.ts            # 新增：修复策略与 handler 行为矩阵
  virtual-tool-cr-fixes.spec.ts               # 调整现有 INVALID_JSON 相关断言
```

## 变更点清单

### 1) 设置与持久化

**文件**：`src/infra/persistence/vfs-extension-settings.schema.ts`

- 新增字段：`virtualToolJsonRepairEnabled: boolean`
- 默认值：`true`（新能力默认生效，避免双语义历史包袱）
- `parseVfsExtensionSettings` 与 `serializeVfsExtensionSettings` 补齐读写

**文件**：`src/App.vue`

- 在现有设置面板新增 checkbox：
  - 文案：`启用工具调用 JSON 自动修复（仅消息标签通道）`
  - 说明：`采用保守策略；低把握场景不执行`
- `onMounted + subscribe` 同步新字段
- `@change` 持久化到 `vfsPersistenceStore.updateExtension(...)`

### 2) 消息解析管线

**文件**：`src/app/services/message/virtual-tool-call-parser.ts`（新增）

- 导出统一接口（示意）：
  - `parseVirtualToolEnvelope(callContent, options)`
  - 返回 union 结果：
    - `kind: 'parsed'`（strict 成功）
    - `kind: 'repaired'`（repair 成功，附 `repairNotes`）
    - `kind: 'strict-failed'`（开关关时失败）
    - `kind: 'non-repairable'`（策略拒绝）
    - `kind: 'repair-failed'`（尝试后仍失败）

**文件**：`src/app/services/message/json-repair-policy.ts`（新增）

- 提供规则函数（示意）：
  - `assessRepairability(raw: string): { allowed: boolean; reasonCode?: string }`
- 首版仅实现结构级高把握规则；
- 输出 reasonCode 供日志/测试断言（例如 `UNTERMINATED_STRING`, `LIKELY_TRUNCATED_PAYLOAD`）。

### 3) Handler 行为重构

**文件**：`src/app/services/message/virtual-tool-message-handler.ts`

- 替换直接 `JSON.parse` 为 `parseVirtualToolEnvelope`；
- 读取开关：`this.runtime` 继续管 `virtualToolCallEnabled`，JSON 修复开关从 store extension 状态读取（可通过注入 getter，避免 handler 直接耦合 store 实现）；
- 分支策略：
  1. **strict/repaired 成功**：执行 batch；若 repaired，result 增加可审计标记（如 `repairApplied: true` + `repairNotes`）；
  2. **strict-failed / non-repairable / repair-failed**：统一不改 messageText、不写 `INVALID_JSON` result、返回 `handled: false`。
- 日志策略：
  - repaired 成功：批次日志补充 `argsSummary` 或 `errorCode` 扩展标识（如 `JSON_REPAIRED` 观测标记）；
  - non-repairable/repair-failed：记录“跳过执行”原因，便于观测，但不消费 call。

### 4) Function Calling 保持不变

**文件**：`src/infra/sillytarvern/function-tools/*`

- 不改逻辑，仅在 spec 与测试中明确“无影响”。

## 详细实现步骤

1. **扩展 schema**
   - 增加 `virtualToolJsonRepairEnabled` 字段与默认值；
   - 更新 parse/serialize 与相关类型。
2. **设置页接线**
   - `App.vue` 增加开关、初始化、订阅同步、持久化写回。
3. **抽取解析器**
   - 新建 `virtual-tool-call-parser.ts`，封装 strict parse + repair 尝试；
   - 新建 `json-repair-policy.ts`，实现保守规则与 reason code。
4. **替换 handler 解析路径**
   - 接入解析器结果分支；
   - 统一失败语义为“保留 call + 不执行”；
   - 开关仅控制“是否尝试 repair”，不控制失败后是否消费 call。
5. **审计信息落地**
   - result payload 增加修复标识字段（仅修复成功场景）；
   - 日志增加 repair 相关 reason 以便统计。
6. **补充/调整测试**
   - 新增修复矩阵测试；
   - 调整已有 malformed case，覆盖开关开/关分支。
7. **回归验证**
   - 运行 `npm run test:run`；
   - 人工验证典型消息流（接收、编辑、重复触发）。

## 测试策略

### 单元测试

1. `virtual-tool-call-parser`：
   - strict 合法 JSON -> `parsed`
   - 缺 `}` -> `repaired`
   - 尾逗号 -> `repaired`
   - 未闭合字符串 -> `non-repairable`
   - 严重截断 -> `non-repairable` / `repair-failed`

2. `json-repair-policy`：
   - 结构可修与低把握拒绝分类准确；
   - reasonCode 稳定、可断言。

### 集成测试（handler 级）

基于 `VirtualToolMessageHandler` + `ChatVfsRuntime`：

- 开关**关闭** + malformed：不执行、保留 call（不写失败 result）；
- 开关**开启** + 可修 malformed：成功执行写入，result 含修复标记；
- 开关**开启** + 不可修 malformed：message 保留 call，`handled=false`，VFS 不变；
- 既有规则回归：
  - 多 result 标签拒绝；
  - 最后一段 call 生效；
  - 锁防并发重复执行不回归；
  - FC 通道测试不变。

### 测试用例

1. `missing_closing_brace_should_repair_and_execute_when_toggle_on`
2. `trailing_comma_should_repair_and_execute_when_toggle_on`
3. `unterminated_string_should_skip_and_keep_call_when_toggle_on`
4. `malformed_json_should_keep_call_when_toggle_off`
5. `repair_success_should_emit_repair_audit_marker`
6. `function_calling_path_should_not_use_repair_logic`

## 风险与回滚方案

### 风险

1. **误修复导致误执行**：尤其 `content` 大文本场景。
2. **规则边界复杂度**：保守修复规则过宽会误执行，过窄会收益不足。
3. **重试语义变化**：开关开且失败保留 call，可能导致重复触发频率上升（但符合 PRD）。

### 缓解

- 采用保守规则 + 明确 reasonCode；
- 默认开启，开关可用于临时停用 repair 尝试；
- 以 handler 集成测试覆盖关键分支与并发锁行为。

### 回滚

- 快速回滚：将开关关闭（仅停用 repair 尝试，失败仍保留 call）；
- 代码回滚：删除 parser 接入，恢复 handler 直接 strict parse 路径；
