# VFS 文件快照与回滚 技术规格（SPEC）

## 设计目标

- **对齐 PRD**：快照与执行日志分离；日志仅 **引用** `snapshotId`；默认保留最近 **10** 条快照（可配置）；回滚 **全成功或全失败**；删除/重命名等由 **路径 manifest** 表达；快照库 **不** 存整棵聊天树副本。
- **对齐代码现状**：替换当前基于 `chatVfsVersions` + `ChatVfsVersionService` + `commitService` / `rollbackService` 的「提交记录」体系；工具路径沿用 `ChatVfsRuntime.executeBatch` 的事务语义（成功才落盘）。
- **用户约束（本轮明确）**：**不考虑旧数据兼容**、**不要技术债**、**完全迁移**——上线即采用新 schema，旧字段不在读写路径保留（解析时可 **丢弃** 历史提交数据，不做双读双写）。

## 现状约束（基于代码阅读）

### 持久化边界

- 聊天元数据由 `parseVfsChatMetadata` / `serializeVfsChatMetadata`（`src/infra/persistence/vfs-chat-metadata.schema.ts`）定义，当前包含：
  - `chatVfsSnapshot`：当前工作树（权威状态）
  - `chatVfsLogs`：工具/批次日志（`ChatVfsLogService`，按 `extension.logMaxBytes` 做 FIFO 裁剪）
  - `chatVfsVersions`：提交/回滚历史（本需求 **删除**）
  - `workTree`、`templateInitialized` 等：保持不变

### 「提交记录」现有链路（待移除）

| 区域 | 文件 | 作用 |
|------|------|------|
| 手动保存整快照进历史 | `src/app/services/vfs/commitService.ts` | `saveCommit` 向 `chatVfsVersions` 追加带 `snapshot` 的条目 |
| 回滚 | `src/app/services/vfs/rollbackService.ts` | 从 `chatVfsVersions` 取 `snapshot` 覆盖 `chatVfsSnapshot` |
| UI 封装 | `src/app/composables/components-composables/useVfsCommitActions.ts`、`useVfsRollbackActions.ts` | toast、追加回滚产生的「伪提交」等 |
| 工具批次后写元数据 | `src/app/services/vfs-runtime/chat-vfs-runtime.ts` | `commitByToolBatch` → `ChatVfsVersionService` |
| 版本服务 | `src/app/services/vfs-version/chat-vfs-version-service.ts` | 仅追加轻量元数据（多数 **无** `snapshot`，无法作为回滚锚点） |
| 历史 UI | `src/app/screens/business-screens/VfsHistoryScreen.vue` + `VfsCommitTab.vue` | 列表与批量/单条回滚 |
| 主屏同步 | `src/app/screens/business-screens/VfsMainScreen.vue` | `refreshAuthoritativeState` 将 `chatVfsVersions` 映射到面板 history；模板覆盖时清空 `chatVfsVersions` |

### 执行日志现有链路（保留并扩展字段）

- `VirtualToolMessageHandler`（`src/app/services/message/virtual-tool-message-handler.ts`）在批次执行后 `logs.append(...)`；当前 **未** 写入 `commitId` 与快照关联（`ChatVfsLogEntry.commitId` 字段已存在但未贯通）。
- `ChatVfsLogService`（`src/app/services/vfs-log/chat-vfs-log-service.ts`）仍负责字节上限裁剪；快照条数策略与之 **独立**（避免日志被裁剪导致「有日志无快照」时，回滚失败已在 PRD 允许范围内，但应在实现时尽量 **先写快照再写日志** 或 **同一事务内更新**）。

### 运行时注入

- `src/main.ts`：`ChatVfsVersionService` 注入 `ChatVfsRuntime`；改造后应替换为 **快照服务**（或合并入 runtime），保证初始化顺序不变。

## 总体方案

### 数据模型（新）

1. **`chatVfsSnapshot`**  
   仍为当前权威工作树，不变。

2. **快照仓库（独立字段，与日志分离）**  
   新增例如 `chatVfsSnapshots: ChatVfsSnapshotRecord[]`（名称以最终实现为准）。**不再**在每条记录内存放完整 `VfsSnapshot` 树副本；改为 **按路径 manifest**：

   - `id: string`：稳定引用（日志 `snapshotId` 指向此 id）
   - `time: string`（ISO）
   - `kind: 'manual' | 'tool-batch-pre'`
   - `entries: VfsPathSnapshotEntry[]`：**有序路径条目列表**（实现须定义稳定排序，例如路径字典序），每条至少包含：
     - `path: string`：规范化后的 VFS 绝对路径  
     - `presence: 'absent' | 'present'`：该路径在 **锚定时刻** 是否存在节点  
     - 当 `present` 时：`node` 载荷须足以在内存中 **还原该路径节点**（文件：内容与必要元数据；目录：至少能还原「空目录 / 占位」语义；若当前 `VfsSnapshot` 中目录需携带子树，则条目应覆盖 **回滚所需的最小子树**，可为「该路径为根的子树序列化」——仍属 **按路径根** 的切片，而非无差别整树快照）  
   - 可选：`summary` / `label`、`batchId` / `messageId` 等便于对照日志

   **与「整树快照」的区别**：权威当前树仍是 `chatVfsSnapshot`；快照库只追加 **变更相关路径** 的 before 切片，满足「单文件 / 少路径」存储直觉与 PRD 体积目标。

3. **保留策略（配置化）**  
   在 **扩展设置**（`vfs-extension-settings.schema.ts`）增加例如 `snapshotMaxCount: number`，**默认 10**。  
   对 `chatVfsSnapshots` 做 **FIFO 或仅保留最近 N 条**（实现选一种并写死文档）；与 `logMaxBytes` **无关**。

4. **`chatVfsLogs`（扩展）**  
   在 `ChatVfsLogEntry` 增加可选字段，例如 `snapshotId?: string`（或 PRD 所称「快照版本号」——与 `chatVfsSnapshots[].id` 对齐）。  
   **不在日志内存 payload**。  
   **语义约定（实现必须统一）**：
   - **工具批次成功**：在 **`executeBatch` 成功落盘之后**，对比 **落盘前** `before` 与 **落盘后** `after` 两棵权威树，计算 **受影响路径集合**（见下「路径 diff」）。对集合中每一路径，从 **`before` 树** 提取 `VfsPathSnapshotEntry`（含 `absent`）。将 `{ id, time, kind: 'tool-batch-pre', entries }` 写入快照仓库；批次级日志写入 `snapshotId`。语义仍为 **撤销本次批次**：回滚即把 manifest 原子应用到当前树。  
   - **手动快照**：用户在 **文件编辑器页** 触发时，**默认**仅对 **当前活动文件路径** 生成一条（或少量）`entries`（`kind: 'manual'`）；若产品后续扩展「多选路径打快照」，仍使用同一 manifest 模型。

   **路径 diff（工具批次，替换现状粗粒度 `'*'`）**：  
   - 在 `ChatVfsRuntime.executeBatch`（或专用 diff 工具）内对 `before` / `after` 做 **结构化路径级 diff**，得到 `changedPaths: string[]`，至少覆盖：内容变更、新建、删除、重命名涉及的 **旧路径与新路径**（重命名必须同时出现在 entries 中，否则无法恢复树结构）。  
   - 若 diff 实现复杂度过高，允许 v1 采用「导出两棵树的节点路径集合对称差 + 对疑点做深度比较」的策略，但 **不得** 再以单一 `'*'` 代替真实路径集合用于快照写入。

> **说明**：pre/post 语义不变——锚定数据仍来自 **批次前** 树 `before`；仅 **持久化形态** 从「整树」改为「从 `before` 提取的路径 manifest」。

### 回滚流程（原子性）

1. 用户在 **已定案的入口** 触发回滚，传入目标 `snapshotId`。
2. 从快照仓库取出记录；校验 `entries` 完整、可解析。
3. 在内存中 `importSnapshot` 当前 `chatVfsSnapshot` 到 `VfsCore`（工作副本），对 `entries` **按实现规定的顺序** 应用（建议：先处理路径删除/替换语义，再写入 present 节点；目录/重命名顺序须在单元测试中锁死），任一步失败则 **丢弃工作副本**。
4. 成功后 `exportSnapshot()` 得到新树，**一次** `updateChat` 写入 `chatVfsSnapshot`。
5. 任一步失败 → **不写 chat**，toast 明确「快照不可用」。

**不变量**：回滚只改变 manifest 所描述的路径子图；**未出现在 manifest 中的路径** 必须与回滚前字节级一致（由「工作副本来自当前整树 + 仅应用 manifest」自然满足）。

不在此版本实现「跨多条日志编排批量撤销」（PRD 不包含）。

### 界面入口（已定案）

| 入口 | 能力 | 说明 |
|------|------|------|
| **文件编辑器页** | **手动快照** + **按快照 id 回滚** | 默认对 **当前活动文件路径** 写入 manifest（`kind: 'manual'`）；回滚仅恢复该快照所含路径，其余路径不变。 |
| **日志屏** | **按日志行回滚** | 展示 `chatVfsLogs`；对 **具备 `snapshotId`** 且快照仍存在的行提供「回滚」（将对应 manifest 原子应用到当前树）。 |

两处入口共用 **`applySnapshotById`**（或等价名）：内部统一为「加载 manifest → 内存应用 → 单次持久化」。

### 完全迁移 / 无兼容

- `serializeVfsChatMetadata` **不再输出** `chatVfsVersions`。
- `parseVfsChatMetadata` **忽略** 磁盘上旧键 `chatVfsVersions`（或读取即丢弃），**不**合并进内存状态。
- 删除 `ChatVfsVersionEntry`、`VfsCommitActionType`、回滚相关类型等 **若仍有引用则一并清理**；避免「遗留类型仅供解析」。

## 最终项目结构（逻辑模块）

| 模块 | 职责 |
|------|------|
| `infra/persistence/vfs-chat-metadata.schema.ts` | 新快照数组字段、`ChatVfsLogEntry` 扩展、`parse/serialize` 迁移 |
| `infra/persistence/vfs-extension-settings.schema.ts` | `snapshotMaxCount` 默认 10 |
| 新增 `app/services/vfs-snapshot/chat-vfs-snapshot-service.ts`（建议） | 追加快照 manifest、FIFO 裁剪、按 id 获取、`applySnapshotById`（内存应用 + 单次导出） |
| 新增 `domain` 或 `vfs-snapshot` 内 **路径 diff** 工具（建议 `vfs-snapshot-diff.ts`） | `before`/`after` → `changedPaths`；供 runtime 构建 manifest |
| `app/services/vfs-runtime/chat-vfs-runtime.ts` | 成功落盘后：diff → 从 `before` 提取 `entries` → 写入快照服务并返回 `snapshotId` |
| `app/services/message/virtual-tool-message-handler.ts` | 批次日志写入 `snapshotId` |
| 删除/替换 | `commitService.ts`、`rollbackService.ts`、`chat-vfs-version-service.ts`、`useVfsCommitActions`、`useVfsRollbackActions`（回滚改为新 composable） |
| UI | 移除 `VfsCommitTab` 提交列表；**日志屏**（`VfsHistoryScreen`）改为日志列表 + 行级回滚；**编辑器页**（`VfsMainScreen` 编辑模式或等价组件）增加手动快照/回滚控件；`VfsMainScreen` 去除 `chatVfsVersions` 映射 |

## 变更点清单

### 必须删除或改写

- `src/app/services/vfs/commitService.ts`、`src/app/services/vfs/rollbackService.ts`
- `src/app/services/vfs-version/chat-vfs-version-service.ts` 及 `main.ts` 注入
- `src/app/composables/components-composables/useVfsCommitActions.ts`、回滚相关 composable（替换为新 API）
- `src/app/components/business-components/VfsCommitTab.vue`（删除或改为快照/日志面板）
- `VfsHistoryScreen.vue`：数据源改为 `chatVfsLogs` + 可选 `chatVfsSnapshots`
- `VfsMainScreen.vue`：`refreshAuthoritativeState` 中 `chatVfsVersions` → 新结构；`appendHistory` / 保存按钮改为调用快照服务
- `extension-vfs-template-service.ts`：`overwriteChatWithTemplate` 等处清空 **`chatVfsSnapshots`**，不再提 `chatVfsVersions`

### 必须扩展

- `vfs-chat-metadata.schema.ts`、`vfs-extension-settings.schema.ts`
- `chat-vfs-runtime.ts`、`virtual-tool-message-handler.ts`
- `vfs-persistence-store.ts`：`snapshot()` 中对新数组做浅拷贝（与 logs 一致）

### 测试

- 删除或重写：`commit-service.spec.ts`、`rollback-service.spec.ts`、`rollback-actions.provenance.spec.ts` 等依赖旧提交的用例
- 新增：快照 FIFO、`snapshotId` 写入日志、回滚成功/快照缺失失败、`overwrite` 清空快照

## 详细实现步骤

1. **Schema 先行**：新增 `chatVfsSnapshots` + `snapshotMaxCount`；`parse` 丢弃旧 `chatVfsVersions`；`serialize` 不写 `chatVfsVersions`。
2. **实现 `ChatVfsSnapshotService`**：追加、按 id 查、超过 N 剔除最旧；统一生成 `id`。
3. **Runtime + diff**：在 `executeBatch` 内保留 `before`（序列化或 `exportSnapshot` 引用）；成功 `updateChat` 写入 `after` 后，计算 `changedPaths`，从 `before` 为每路径构造 `VfsPathSnapshotEntry`，调用快照服务 `recordToolBatchPreManifest(...)` 返回 `snapshotId`；`VirtualToolMessageHandler` 将 `snapshotId` 写入批次级日志。
4. **手动快照**：编辑器 UI 调用 `recordManualSnapshotForPath(path)`（或带可选 `summary`），仅写入该路径（及实现规定的父目录占位若需要）的 `entries`。
5. **回滚 API**：`applySnapshotById(id)` → 内存 `VfsCore` 应用 manifest → `exportSnapshot` → **一次** `updateChat`。
6. **拆 UI**：删除提交 Tab；**日志屏**展示 `chatVfsLogs`，对含 `snapshotId` 的行提供「回滚」；**编辑器页**提供手动「保存快照」「回滚到…」（快照列表或最近快照，具体控件以实现为准）。
7. **清扫**：删废弃文件与引用；跑全量 `vitest`。
8. **文档**：更新 README 或开发者说明中关于 metadata 字段的描述（若存在）。

## 测试策略

### 单元 / 服务层

- 快照 FIFO：插入第 11 条时第 1 条被剔除；默认 10、可配置 3。
- `parseVfsChatMetadata`：输入含旧 `chatVfsVersions` 时，内存无 versions；新字段默认值正确。
- 回滚：`snapshotId` 存在且 manifest 合法时，**manifest 路径** 与预期一致，**非 manifest 路径** 与回滚前一致；`snapshotId` 缺失则 `updateChat` 调用次数为 0（可用 mock store）。

### 集成

- `executeBatch` 成功：日志中 `snapshotId` 非空；快照 `entries` 覆盖 diff 路径；对该快照回滚后 **diff 路径** 与 `before` 一致，**未 diff 路径** 不变。
- 手动单路径快照后修改该文件再回滚：仅该路径恢复，其他路径不变。

### 回归

- 现有 `vfs-ui-cr-loop.spec.ts` 等引用提交历史的用例需更新选择器与前置数据。
- 模板覆盖：断言 `chatVfsSnapshots` 被清空（与当前清空 versions 行为对齐）。

### 测试用例（摘要）

| ID | 场景 | 预期 |
|----|------|------|
| T1 | 默认保留 10 条快照，插入 11 条 | 最旧删除，`snapshotMaxCount` 可改为 3 复测 |
| T2 | 工具批次成功 | 批次日志含 `snapshotId`，且该 id 在 `chatVfsSnapshots` 内 |
| T3 | 回滚有效 manifest | diff 路径恢复为 `before` 切片；非 manifest 路径不变 |
| T4 | 回滚已淘汰 id | 失败，状态不变 |
| T5 | 解析旧 metadata（含 chatVfsVersions） | 无 versions，不崩溃；新字段默认空数组 |
| T6 | 模板覆盖聊天 | 快照仓库清空 |
| T7 | 编辑器页单路径手动快照后回滚 | 仅该路径变化 |
| T8 | 日志行含 `snapshotId` 回滚 | 与 T3 等价，走日志 UI 路径 |
| T9 | 工具批次含重命名 | `entries` 含旧路径与新路径的 `before` 状态；回滚后树正确 |

## 风险与回滚方案

| 风险 | 缓解 |
|------|------|
| metadata 体积 | 按路径显著优于整树；大文件单路径仍可能大，默认 N=10 约束条数 |
| manifest 应用顺序错误导致半棵树 | 单元测试锁顺序；失败则丢弃工作副本 |
| `snapshotId` 与日志不同步 | 同一 `updateChat` 批次内写入快照与日志；单测锁定顺序 |

### 工具批次成功：日志与快照同一 `updateChat`

当 `ChatVfsRuntime.executeBatch` 传入 `logContext` 且批次成功时，实现将 **`chatVfsSnapshot` 更新、`chatVfsSnapshots` 追加 pre-batch manifest、批次级日志行（含 `snapshotId`）以及逐工具成功诊断行** 合并在 **单次** `updateChat` 中提交，并对拼接后的 `chatVfsLogs` **做一次** `logMaxBytes` FIFO 裁剪。

因此：在正常预算下，`snapshotId` 与刚写入的快照 manifest **同源且同一持久化回合**。若 `logMaxBytes` 极小，FIFO 仍可能裁掉含 `snapshotId` 的旧日志行；**快照库条数由 `snapshotMaxCount` 单独约束**，与日志字节上限无关，故「日志行被裁」不等于「快照条目不可用」（仍可按 id 回滚，直至快照 FIFO 淘汰该 id）。
| 路径 diff 漏路径 | 重命名/新建/删除纳入必测；禁止用 `'*'` 代替路径集合写快照 |

**Git / 发布回滚**：保留独立分支；若上线后问题严重，可暂时 revert 合并提交（用户声明不考虑向前兼容时，不建议长期双轨）。

---

## 评审结论（已定案）

1. **工具批次语义锚点**：**pre-batch**——从 **`before` 树** 为本次 diff 路径提取 manifest；日志仍写 `snapshotId`。  
2. **界面入口**：**文件编辑器页** 手动快照与回滚；**日志屏** 按行回滚。详见「界面入口（已定案）」。  
3. **存储形态（用户补充已定案）**：快照库为 **按路径 manifest**，**不**再存整棵聊天 `VfsSnapshot` 副本；权威当前树仍为 `chatVfsSnapshot`。
