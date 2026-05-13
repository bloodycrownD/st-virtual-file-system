# 路径版本库 + 稀疏检查点（回滚）技术规格（SPEC）

## 设计目标

- 对齐 feature PRD：以 **路径版本库** + **稀疏检查点（`tree_version`）** 实现 **「回滚 = 物化到某次提交后的整树」**。
- **权威运行时不变量**：`chatVfsSnapshot` 仍是 `VfsCore` / UI / 工具的唯一权威树；检查点应用 = **整树重建** 后 **单次** `updateChat` 写回。
- **破坏性升级（用户已定稿）**：**不兼容**旧版 `tool-batch-pre` / `manual` manifest 与 `snapshotId` 日志引用；**不保留**双轨应用、`applySnapshotById(manifest)` 产品路径及兼容分支；**不留技术债**——旧代码路径删除，旧持久化字段在读入时 **剥离**，序列化 **永不复活** manifest 模型。

**依据代码现状**（将被替换而非并存）：

- `src/infra/persistence/vfs-chat-metadata.schema.ts`：`chatVfsSnapshots`、`ChatVfsLogEntry.snapshotId`。
- `src/domain/vfs-snapshot/vfs-snapshot-types.ts`：`ChatVfsSnapshotKind`、`ChatVfsSnapshotRecord`。
- `src/app/services/vfs-snapshot/chat-vfs-snapshot-service.ts`：`buildToolBatchPreRecord`、`buildManualRecordForPath`、`persistChatFileSaveWithPreSnapshot`、`applySnapshotById`。
- `src/app/services/vfs-runtime/chat-vfs-runtime.ts`：成功后写 pre-manifest。
- `src/app/composables/components-composables/useVfsSnapshotRollback.ts`：调用 `applySnapshotById`。

---

## 总体方案

### 持久化形态（唯一真源）

在 **`VfsChatMetadata`** 中：

| 字段 | 说明 |
|------|------|
| `vfsChatPersistenceVersion` | **必填**，整型；本 SPEC 落地值为 **`2`**。`<2` 或缺失视为旧块，走 **剥离规则**（见下）。 |
| `chatVfsSnapshot` | 保留：权威虚拟树。 |
| `vfsPathVersionStore` | **新**：`Record<normalizedPath, PathVersionEntry[]>`，追加式版本链。 |
| `vfsCheckpoints` | **新**：`CheckpointRecord[]`，稀疏 `treeVersion: Record<path, versionId>`，FIFO 与 `snapshotMaxCount` 对齐。 |
| `chatVfsLogs` | 保留数组；**移除** `snapshotId`；仅 **`checkpointId?: string`**（新成功批次/保存行写入）。 |
| `chatVfsSnapshots` | **删除** —— 类型与 `serialize` **不再输出**；`parse` 若读到旧键 **丢弃**。 |
| `workTree` / `mounted` / `templateInitialized` | 保留既有语义。 |

### 架构（单一路径）

```text
写入：executeBatch / editor-save 成功 → append 版本 + append vfsCheckpoints + 日志 checkpointId
应用：applyCheckpointById(id) → validateParentChain → 空树物化 → updateChat(chatVfsSnapshot)
```

**不存在** `applySnapshotById` manifest 分支；**不存在** `chatVfsSnapshots` 运行时依赖。

### 核心算法（检查点 → 权威树）

（与上一版 SPEC 相同，此处摘要）

1. 取 `vfsCheckpoints` 中 `id` 匹配项的 `treeVersion`。  
2. **父链校验**（PRD）：任一文件路径的父目录链须全部出现在 `treeVersion`；失败 → 拒绝应用。  
3. `VfsCore` 从空树按序 `mkdir` / `writeFile` 物化；文件正文来自 `vfsPathVersionStore[path]` 中对应 `versionId` 的 `content`（`VfsFileContentSnapshot` + 现有 `DeflateContentCodec`）。  
4. 单次 `updateChat` 提交 `chatVfsSnapshot`。

### 检查点生成

1. `S = collectPathsFromSnapshot(afterSnapshot)`（跳过 `ROOT_PATH` 作为键）。  
2. 每路径追加 `PathVersionEntry`，填 `treeVersion[path]=versionId`。  
3. `vfsCheckpoints.push({ id, time, source, treeVersion, ... })`；日志写 `checkpointId`。  
4. FIFO：`snapshotMaxCount` 裁剪 **检查点**；**sweep** 孤儿版本（PRD 验收 7）。

---

## 破坏性读入与剥离规则（替代原「兼容 / 迁移」节）

**当 `parseVfsChatMetadata` 发现 `vfsChatPersistenceVersion !== 2`（含缺失）或输入中存在非空 `chatVfsSnapshots`：**

1. **`chatVfsSnapshots`**：不进入内存模型；**丢弃**。  
2. **`chatVfsLogs`**：保留条目文本字段用于审计，但 **删除每条中的 `snapshotId`**（若存在）；**不**尝试将旧 manifest 转为检查点。  
3. **`vfsPathVersionStore` / `vfsCheckpoints`**：若缺失则 `{}` / `[]`。  
4. **`vfsChatPersistenceVersion`**：置为 **`2`**，并在首次 `updateChat`（或解析后惰性写回）时 **持久化**，使会话块进入新格式。  
5. **`chatVfsSnapshot`**：**保留原样**（不把用户文件清空）；仅 **还原/回滚历史** 在新格式下从空检查点重新开始。

> **用户可见影响**：旧会话打开后 **失去** 基于旧 `snapshotId` 的一键还原；执行日志仍在，但无可用 `checkpointId` 直至产生新批次/保存。

---

## 最终项目结构（删除技术债后）

```text
src/infra/persistence/
  vfs-chat-metadata.schema.ts     # 删 chatVfsSnapshots；加 version 2 + checkpoint 字段；parse 剥离
  vfs-checkpoint.schema.ts          # PathVersionEntry / CheckpointRecord

src/app/services/vfs-checkpoint/
  chat-vfs-checkpoint-service.ts    # 唯一应用入口 applyCheckpointById + 写入 + FIFO/sweep

src/app/services/vfs-runtime/
  chat-vfs-runtime.ts               # 仅写 checkpoint

src/app/screens/business-screens/
  VfsMainScreen.vue                 # 保存仅写 checkpoint
  VfsHistoryScreen.vue              # 仅 checkpointId + 回滚

src/app/composables/components-composables/
  useVfsSnapshotRollback.ts        # 改为调用 applyCheckpointById（或重命名 composable）

删除 / 大幅删瘦（不留桩）：
  chat-vfs-snapshot-service.ts 中的 manifest 构建与应用（整文件可删若逻辑全部迁至 checkpoint 服务，或仅保留与模板无关的极小工具 —— 实现阶段以「无 dead export」为准）
  domain vfs-snapshot-types 中与 chat manifest 强绑定的类型若仅被删代码引用则一并删除
```

---

## 变更点清单（破坏性）

| 区域 | 动作 |
|------|------|
| Schema | 删 `chatVfsSnapshots`；删 `ChatVfsLogEntry.snapshotId`；增 `vfsChatPersistenceVersion`、`vfsPathVersionStore`、`vfsCheckpoints`、`checkpointId` |
| 解析 | 旧数据剥离 + 写回 v2 |
| 运行时 / 编辑器 | 仅 checkpoint 写入 |
| 应用 | **仅** `applyCheckpointById` |
| UI | **仅** `checkpointId`；无旧按钮分支 |
| 测试 | 删除所有依赖 `tool-batch-pre` / `applySnapshotById` 成功路径的旧用例；新增 v2 全链路 |

---

## 详细实现步骤

### A — Schema + 剥离解析

1. 改 `VfsChatMetadata` 与 `parse`/`serialize`。  
2. 单测：旧 JSON 含 `chatVfsSnapshots` → 解析后为空数组且 `version===2`；`snapshotId` 被剥。  
3. 单测：`serialize` 输出 **不含** `chatVfsSnapshots` 键。

### B — `ChatVfsCheckpointService`

实现写入、FIFO、sweep、`applyCheckpointById`；单元测试 T1–T3、T5、父链 T6。

### C — 接线

`ChatVfsRuntime`、`VfsMainScreen` 保存、`useVfsSnapshotRollback`（或更名）、`VfsHistoryScreen`。

### D — 删债

移除 `buildToolBatchPreRecord`、`persistChatFileSaveWithPreSnapshot`、`applySnapshotById` 及所有引用；`grep` 全仓库清零 `tool-batch-pre`、`snapshotId`、`chatVfsSnapshots`。

### E — 文档

`prd.md` 验收 6 / T7 与本文一致；代码注释去掉 pre-batch 叙事。

---

## 测试策略

- 单元：剥离解析、物化、FIFO+sweep、父链。  
- 集成：新会话 T2 场景。  
- **不再**测「旧 manifest 仍可应用」。

### PRD 映射

| PRD ID | 说明 |
|--------|------|
| T7 | 改为：旧 metadata 解析后 **无** `checkpointId` 直至新写入；**无** manifest 应用 API |

---

## 风险与回滚方案

| 风险 | 说明 |
|------|------|
| 用户依赖旧还原点 | **已知破坏**；发版说明中写明。 |
| 回滚代码自身 | Git revert 本 feature；无「再开旧路径」开关。 |

---

**文档路径**：`docs/Iterations/VFS-History-Screen-Rollback-And-Scroll/features/post-only-snapshots-rollback-semantics/spec.md`

本版 SPEC 为 **破坏性、单轨、零旧 manifest 技术债**；实现前无需再选「迁移 / 双轨」策略。
