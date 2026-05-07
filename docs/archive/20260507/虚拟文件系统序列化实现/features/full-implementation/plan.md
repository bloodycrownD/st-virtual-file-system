# 虚拟文件系统序列化实现 设计方案

## 设计目标

- 以“外部文件系统语义、内部可替换存储”的方式实现 VFS。
- 在不绑定 ST 具体持久化通道的前提下，完成可落地的完整实现。
- 保证快照结构完全 JSON 友好，支持 `JSON.stringify/parse` 往返恢复。
- 仅压缩文件内容，元数据明文保留；并提供按阈值压缩策略。
- 为后续接入版本管理预留边界，但本次不实现版本功能。

## 总体方案

采用分层与端口适配设计：

1. **VFS Core（领域层）**
   - 负责路径解析、目录/文件节点管理、文件系统语义 API。
   - 不关心数据最终存储位置。
2. **Snapshot Repository（抽象存储层）**
   - 只定义读取/写入 `VfsSnapshot` 的接口。
   - 当前提供内存实现，后续可替换为 ST/IndexedDB/远端实现。
3. **Content Codec（内容编解码层）**
   - 仅处理文件内容压缩与解压。
   - 元数据不参与压缩。
4. **Application Facade（应用服务层）**
   - 把 Core + Repository + Codec 组装成可直接调用的统一入口。
   - 对外提供保存、加载、导出快照、导入快照能力。

关键决策：

- **外部接口遵循文件系统“子集”**，而非完整复刻 Linux/Windows。
- **内部模型采用对象化节点索引**（`id -> node` + 目录 children），便于序列化和后续扩展。
- **写入策略默认内存变更 + 显式持久化**（可扩展为自动保存）。

## 最终项目结构

基于当前项目，新增以下目录（文件名可按实现微调）：

```text
src/
  domain/
    vfs/
      types.ts
      path-utils.ts
      vfs-errors.ts
      vfs-core.ts
  infra/
    serialization/
      content-codec.ts
      deflate-codec.ts
    repository/
      vfs-snapshot-repository.ts
      in-memory-vfs-snapshot-repository.ts
    persistence/
      vfs-snapshot.schema.ts
  app/
    services/
      vfs/
        vfs-service.ts
        vfs-service-factory.ts
  tests/
    vfs/
      vfs-core.spec.ts
      vfs-serialization.spec.ts
      vfs-service.e2e.spec.ts
```

说明：
- `infra/persistence` 继续承载 schema 相关内容，保持现有工程风格一致。
- 若当前项目使用 `vitest`，测试直接放在 `tests/` 或与源码同级，按现有规范统一。

## 变更点清单

1. **新增快照数据模型**
   - 定义 `VfsSnapshot`、`VfsNodeSnapshot`、`VfsFileContentSnapshot`。
   - 约束字段全部 JSON 友好。
2. **新增内容压缩协议**
   - `encoding: 'plain' | 'deflate-base64'`
   - `data: string`（明文或压缩后 base64）
   - `originalSize/compressedSize`（用于观测与调优，可选）
3. **实现路径与节点管理**
   - 根目录约定、路径标准化、路径合法性校验。
   - 文件/目录节点增删改查、树结构维护。
4. **实现 VFS 扩展档 API**
   - `mkdir/list/readFile/writeFile/delete/exists/move/rename/stat/copy/touch/walk`
   - 支持递归删除和目录遍历。
5. **实现快照导入导出**
   - `exportSnapshot()` / `importSnapshot(snapshot)`
   - 导入时进行 schema 级校验与归一化。
6. **实现存储抽象与默认实现**
   - Repository 接口 + InMemory 实现。
7. **接线应用服务**
   - `VfsService` 负责调用 core 并按策略持久化。
8. **补充测试**
   - 单元测试覆盖路径、节点、压缩、序列化、端到端流程。

## 详细实现步骤

### 第 1 步：定义核心类型与错误模型

- 新建 `types.ts`：
  - `VfsNodeType`, `VfsStat`, `VfsListItem`, `VfsWriteOptions` 等。
- 新建 `vfs-errors.ts`：
  - 统一错误类型（如 `NotFound`, `AlreadyExists`, `InvalidPath`, `NotDirectory`）。
- 验证点：类型可被独立编译通过。

### 第 2 步：实现路径工具与合法性约束

- 新建 `path-utils.ts`：
  - 规范化分隔符、处理 `.`/`..`、根路径约束、空路径处理。
- 明确路径约定：
  - 统一内部使用 POSIX 风格 `/`。
  - 拒绝越级路径。
- 验证点：路径单测通过。

### 第 3 步：实现内容编解码

- 定义 `ContentCodec` 接口：`encode(text)`, `decode(snapshotContent)`.
- 实现 `deflate-codec.ts`：
  - 小文本走 `plain`。
  - 大于阈值走 `deflate + base64`。
- 验证点：
  - 编解码往返一致。
  - 阈值边界行为正确。

### 第 4 步：实现 VFS Core

- 在 `vfs-core.ts` 实现完整扩展档 API。
- 内部采用节点索引 + 目录 children 映射。
- 每次写操作更新 `mtime` 与必要的 `size`。
- 验证点：
  - 核心 API 单元测试通过。

### 第 5 步：实现快照 schema 与导入导出

- 新增 `vfs-snapshot.schema.ts`：
  - `parseVfsSnapshot(raw)` 防御性解析。
  - `serializeVfsSnapshot(state)` 输出纯字面量对象。
- Core 提供 `toSnapshot/fromSnapshot`。
- 验证点：
  - `JSON.stringify/parse` 后恢复结果一致。

### 第 6 步：实现 Repository 抽象与内存实现

- 定义 `VfsSnapshotRepository`：
  - `load(): Promise<VfsSnapshot | null>`
  - `save(snapshot: VfsSnapshot): Promise<void>`
- 提供 `InMemoryVfsSnapshotRepository`。
- 验证点：
  - Repository 可替换，VFS 不感知后端。

### 第 7 步：实现应用层服务装配

- 新建 `vfs-service.ts`：
  - 暴露统一 API（透传 core 能力 + save/load/export/import）。
- 新建 `vfs-service-factory.ts`：
  - 装配默认 codec + repository + core。
- 验证点：
  - 端到端脚本/测试覆盖完整流程。

### 第 8 步：测试与文档回填

- 增补测试并运行：
  - 核心行为、序列化、压缩策略、异常场景。
- 补充 README 使用示例与后续 ST 适配说明。
- 验证点：
  - 测试全绿，关键路径手工验证通过。

## 测试策略

- **单元测试**
  - 路径工具：合法路径、越级路径、边界路径。
  - Core：每个 API 的成功与失败分支。
  - Codec：阈值前后编码行为、解码容错。
  - Schema：脏数据输入回退策略。
- **集成测试**
  - VfsService + InMemoryRepository 的端到端行为。
- **回归测试**
  - 快照兼容性（同版本往返，旧字段缺失回退默认值）。

### 测试用例

1. 创建目录并写入文本文件，读取内容一致。
2. 重命名文件并移动目录，`list` 与 `stat` 正确。
3. 复制文件后删除原文件，副本仍可读。
4. 递归遍历返回完整节点集合，递归删除后节点消失。
5. 大文本写入触发压缩，读取后与原文一致。
6. 小文本写入不压缩，快照中 `encoding='plain'`。
7. 导出快照后 `JSON.stringify/parse` 再导入，结构与行为一致。
8. 非法路径（越级）调用被拒绝并返回明确错误。

## 风险与回滚方案

- **风险：压缩库兼容性**
  - 方案：优先使用项目已有依赖；若不稳定，临时降级为 `plain` 并保留接口不变。
- **风险：路径规则不统一导致行为歧义**
  - 方案：在 `path-utils` 固化规则并以测试锁定，禁止隐式兼容多套规则。
- **风险：快照字段演进造成兼容问题**
  - 方案：在快照中加入 `schemaVersion`，`parse` 做向后兼容。
- **风险：实现复杂度超预期**
  - 方案：按步骤提交，每步可独立回退；若某步失败，回退到前一稳定步骤并保留测试。

回滚策略：

- 代码级回滚：按步骤粒度回滚新增模块（先撤服务装配，再撤 repository，再撤 core 增量）。
- 行为级回滚：关闭压缩（阈值设为 `Infinity` 或 `enabled=false`）恢复明文存储，不影响 API。
