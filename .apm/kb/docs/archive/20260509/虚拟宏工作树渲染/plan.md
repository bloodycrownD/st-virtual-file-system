# 虚拟宏工作树渲染 设计方案

## 设计目标

- 在 `st-virtual-file-system` 内注册并实现 `{{VIRTUAL_FILE_TREE}}`、`{{VIRTUAL_WORK_TREE}}` 两个宏，handler **严格同步**（无 `async`、无 `Promise`）。
- **`chatVfsSnapshot`**：当前 chat 在 `chatMetadata` 里持久化的整棵 VFS（`VfsSnapshot`）。**不变量**：chat 完成 VFS 初始化后，快照在持久化与运行时应 **始终为非 null 的合法对象**（至少含根目录）；宏侧不把「长期 null」当规格分支，缺失则修初始化/解析链路。
- `VIRTUAL_FILE_TREE`：基于当前 chat 的 `chatVfsSnapshot` 输出固定 `tree` 风格、仅节点名称、路径由层级推导。
- `VIRTUAL_WORK_TREE`：基于 **chat 级工作树配置** + 同一快照，按 spec 解释目录规则、`selectedFiles`、head/tail、填充策略与 FrontMatter；无 chat 工作树配置时输出空字符串。
- 工作树配置与 VFS 一致：chat 生效、extension 作模板并支持克隆（与现有 `templateInitialized` / 模板服务对齐）。
- 输出中的 `createdAt` / `updatedAt` / `updatedBy` 与 spec 一致；**渲染层**不编造元数据，缺字段在开发期通过 **快照解析规范化 + 写路径补全** 消除。

## 总体方案

1. **数据模型**
   - 在 `VfsChatMetadata` 中新增 `workTree: WorkTreeConfig | null`（或等价字段名），由 `parseVfsChatMetadata` / `serializeVfsChatMetadata` 读写；缺省为 `null`，宏 `VIRTUAL_WORK_TREE` 返回 `''`。
   - `WorkTreeConfig` 包含：全局默认目录规则、按目录路径覆盖的规则、`selectedFiles`、**文件夹「读取」一等状态**（例如 `directoryRuleEnabled: Record<path, boolean>` 或等价结构）。
   - **文件夹读取语义（已定稿）**：**仅**决定该文件夹上配置的**目录规则**（排序/头尾/填充）是否生效；不表示「整棵子树自动读取」，也不替代各子目录自身的读取态与规则。
   - extension 侧 `VfsExtensionSettings` 增加可选 `workTreeTemplate`，克隆到 chat 的路径与现有 `ExtensionVfsTemplateService` 一致（可在该服务或 store 的 `updateChat` 中提供 `cloneWorkTreeFromExtension`）。

2. **VFS 快照扩展（满足 `<file>` 元数据）**
   - 当前 `VfsFileNodeSnapshot` 仅有 `mtime`，不足以表达 `createdAt` / `updatedBy`。
   - 扩展文件节点（保持 `schemaVersion: 1` 或递增版本——若递增需在 `parseVfsSnapshot` 中迁移；优先 **仍用 1 并增加可选字段再规范化为必填**）：
     - `ctime: number`（与 `mtime` 同为毫秒时间戳，与现有域模型一致）
     - `updatedBy: 'user' | 'assistant'`
   - **加载时规范化**：旧快照缺少 `ctime`/`updatedBy` 时，在 **parser** 层一次性补全（例如 `ctime = mtime`、`updatedBy = 'assistant'`），并视需要写回持久化；这不属于「渲染层回填」，避免宏内分支污染。
   - **写入时**：所有创建/覆盖文件的路径（虚拟工具写文件、后续 UI 写文件）必须设置 `mtime`、`ctime`（新建时相等，覆盖只更新 `mtime`）和 `updatedBy`（工具链写 `assistant`，用户/UI 写 `user`）。

3. **宏注册与依赖**
   - 新建模块（例如 `src/infra/sillytarvern/macros/register-vfs-macros.ts`）：接收 `getState: () => Readonly<VfsPersistenceState>` 或 `vfsPersistenceStore`，在 handler 内同步读取当前 `chat.chatVfsSnapshot` 与 `chat.workTree`。
   - 在 `main.ts` 中 `initVfsPersistenceStore()` 之后调用 `registerVfsMacros(...)`，从 `SillyTavern.getContext().registerMacro` 注册两个宏名：`VIRTUAL_FILE_TREE`、`VIRTUAL_WORK_TREE`。
   - 扩展未启用时是否仍注册宏：建议 **仍注册但返回空树/空工作树**，或 **与 `extension.enabled` 一致**——实现时二选一并写入注释；默认倾向与 `enabled` 一致，避免误用。

4. **纯函数渲染核心**（便于单测、与 UI 共用）
   - `renderVirtualFileTree(snapshot): string`：`tree` 字符集与缩进在模块内固定常量（`├──` `└──` `│   ` 等），子节点排序规则与 spec 一致（名称排序时与同目录 `VfsCore.list` 一致可调）。
   - `renderVirtualWorkTree(snapshot, workTree): string`：
     - 归一化 `headCount`/`tailCount` 至 `0~1000`；
     - 按目录收集「直接子文件」、应用排序与 head/tail 并集、再应用填充策略；
     - `selectedFiles` 优先、路径去重；
     - 文件夹未「读取」则该目录规则跳过；
     - 拼 `<file path="..." updatedAt="..." createdAt="..." updatedBy="user|assistant">` + `N|...` 行。
   - FrontMatter：仅扩展名/类型判断为 markdown 的实现策略写清（例如 `.md`/`.markdown`）；解析失败或非 md → 该文件在 FrontMatter 策略下不输出。

5. **时间与格式化**
   - 统一 `formatMacroTimestamp(ms: number): string` → `yyyy-MM-dd HH:mm:ss`（24 小时制，与 spec 示例一致）。

## 最终项目结构

```text
st-virtual-file-system/src/
  domain/
    vfs/
      types.ts                         # 扩展 VfsFileNodeSnapshot（ctime, updatedBy）
    work-tree/
      work-tree.types.ts               # WorkTreeConfig、目录规则、排序枚举
      work-tree-engine.ts              # 选文件 + 排序 + head/tail + 填充（纯函数）
  infra/
    persistence/
      vfs-chat-metadata.schema.ts     # workTree 字段
      vfs-extension-settings.schema.ts # 可选 workTreeTemplate
      vfs-snapshot.schema.ts          # 文件节点解析/序列化与旧快照迁移
    sillytarvern/
      macros/
        register-vfs-macros.ts        # registerMacro 入口
  app/
    services/
      macros/                         # 可选：macro-render-facade，组合 store + 纯函数
  test/
    work-tree/
      work-tree-engine.spec.ts
    macros/
      virtual-file-tree.spec.ts
      virtual-work-tree.spec.ts
```

（具体文件名可按仓库惯例微调，但保持「纯逻辑在 domain / work-tree，注册在 infra/macros」。）

## 变更点清单

| 区域 | 变更 |
|------|------|
| `vfs-chat-metadata.schema.ts` | 增加 `workTree` 解析与序列化默认值 `null` |
| `vfs-extension-settings.schema.ts` | 可选 `workTreeTemplate` |
| `domain/vfs/types.ts` + `vfs-snapshot.schema.ts` | 文件节点 `ctime`、`updatedBy`；旧快照迁移 |
| 虚拟工具 write/append 等 | 写入时设置 `mtime`/`ctime`/`updatedBy='assistant'` |
| `main.ts` | `initVfsPersistenceStore` 后注册宏 |
| 新增 | `work-tree-engine.ts`、`register-vfs-macros.ts`、FrontMatter 小工具、时间格式化 |
| 模板克隆 | `ExtensionVfsTemplateService` 或 store：chat 初始化时可选复制 `workTreeTemplate` → `chat.workTree`（与产品确认是否默认复制） |

## 详细实现步骤

1. **契约类型**：定义 `WorkTreeConfig`、目录规则（排序字段、方向、head/tail、填充策略、`directoryReadEnabled` 等）的 TypeScript 类型 + parse/serialize（与现有 schema 风格一致）。
2. **chat/extension 持久化**：扩展 `VfsChatMetadata`、`VfsExtensionSettings`，跑通 `parse`/`serialize`  round-trip，默认 `workTree: null`。
3. **VFS 文件节点扩展**：改 `types` + snapshot schema；旧数据在 parse 中补全；更新所有创建/更新文件节点的代码路径。
4. **work-tree 引擎**：实现排序（名称 / `ctime` / `mtime` + 方向）、head/tail 并集去重、填充策略、FrontMatter 抽取、`<file>` 与行号拼接。
5. **VIRTUAL_FILE_TREE**：实现 `renderVirtualFileTree`，连线字符与缩进写入常量。
6. **宏注册**：`registerVfsMacros`，从 `vfsPersistenceStore.getState()` 读当前 chat。依赖 **`chatVfsSnapshot` 不变量**（初始化后恒合法非 null）；若运行时仍为 `null`，在 **store / 模板初始化** 中补「空树快照」写入，而不是在宏里定义第三种产品语义。
7. **模板**：若需要「从 extension 克隆工作树」，在模板初始化流程中增加一步写入 `workTree`。
8. **自测与文档**：对照 `spec.md` 验收标准逐条勾选。

## 测试策略

- **单元测试**（不启动 ST）：
  - 给定小型 `VfsSnapshot` + `WorkTreeConfig`，断言 `VIRTUAL_WORK_TREE` 等价字符串（顺序、去重、head/tail 重叠并集、FrontMatter/非 md、文件夹未读取时规则不生效、`selectedFiles` 覆盖）。
  - `VIRTUAL_FILE_TREE` 快照与稳定文本比对（固定 `tree` 格式常量）。
  - 旧快照无 `ctime`/`updatedBy` 时 parse 后结构完整。
- **手动/集成**：在 ST 中于提示词模板填入 `{{VIRTUAL_FILE_TREE}}` / `{{VIRTUAL_WORK_TREE}}`，切换 chat、写入文件后再次替换，确认同步无 Promise。

### 测试用例（摘要）

| 编号 | 场景 | 期望 |
|------|------|------|
| T1 | `workTree === null` | `VIRTUAL_WORK_TREE` 为 `''` |
| T2 | 仅 `VIRTUAL_FILE_TREE`、多目录多文件 | tree 文本无正文、结构正确 |
| T3 | `selectedFiles` 与目录规则重叠 | 显式读取优先，单一路径只出现一次 |
| T4 | head=2 tail=2，排序后 5 文件 | 并集 4 个不重复 |
| T5 | head=1001 | 按 1000 归一化 |
| T6 | FrontMatter 策略 + 非 md | 不输出该文件 |
| T7 | FrontMatter 策略 + md 无 front matter | 不输出 |
| T8 | 文件夹未读取 + 目录规则 | 规则不产生额外文件 |
| T9 | 宏 handler | 同步返回 string，非 Promise |

## 风险与回滚方案

| 风险 | 缓解 | 回滚 |
|------|------|------|
| 快照字段扩展破坏旧数据 | parse 时迁移 + 单测覆盖旧 JSON | 保留旧字段可读，新版本回退时忽略新字段 |
| 排序/head/tail 与 UI 将来不一致 | 抽取单一 `work-tree-engine`，UI 迭代复用 | 引擎版本化或配置 `engineVersion` |
| 宏同步限制 | 全部读内存 store，禁止 IO | 文档与 code review 强制 |

---

编码前若与本 `plan.md` 不一致，以 `spec.md` 为准；快照非 null 不变量需在实现首屏打通（`parseVfsChatMetadata` / 模板初始化 / chat 挂载）。
