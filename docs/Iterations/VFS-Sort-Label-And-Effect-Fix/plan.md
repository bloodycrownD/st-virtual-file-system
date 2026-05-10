# VFS-Sort-Label-And-Effect-Fix 设计方案

## 设计目标

- 将排序方式文案统一为“文件名称”，保持底层值 `name` 不变。
- 修复“点击确定后排序未生效”的问题，使当前目录文件列表即时按策略重排。
- 保证 UI 列表排序与 `VIRTUAL_WORK_TREE` 渲染排序语义一致（同字段/方向）。

## 总体方案

基于当前实现做“单一规则源”改造：

1. **文案层**：集中替换排序字段文案“名称”→“文件名称”（仅 UI 文案，值域不变）。
2. **列表排序层**：让 `VfsMainScreen` 的目录列表排序读取当前目录已生效规则（`directoryRulesEnabled[path] === true` 时取 override/default；否则回退既有默认行为）。
3. **渲染层校验**：不改 `work-tree-engine` 核心排序算法，仅补回归验证，确保与 UI 规则对齐。

实现上保持“目录优先”不变量（目录在前、文件在后），文件内排序由策略控制，避免破坏当前导航认知。

## 最终项目结构

- `src/app/screens/business-screens/VfsMainScreen.vue`
  - 列表排序策略接入点（当前目录规则应用）
  - 展示策略弹窗文案更新（文件名称）
- `src/domain/work-tree/work-tree-engine.ts`（只做验证，不做逻辑改造为主）
- `test/vfs-ui-cr-loop.spec.ts`
  - UI 侧：文案与即时重排回归
- `test/work-tree-engine.spec.ts`
  - 渲染侧：排序字段/方向对应输出顺序回归

## 变更点清单

1. **`VfsMainScreen.vue`**
   - 现状：`listDirectoryEntries()` 固定按 `name` 排序，未读取 `WorkTreeConfig` 当前目录规则。
   - 变更：
     - 新增“当前目录有效排序规则”解析函数：
       - 当 `directoryRulesEnabled[currentDirectoryPath] === true`：使用 `directoryOverrides[path] ?? defaultRule`
       - 否则使用“默认列表规则”（目录优先 + 名称升序）
     - 将 `listDirectoryEntries()` 中的排序改为基于解析后的规则。
     - 保持目录优先，再对同类节点应用 `sortField/sortDirection`。
   - 文案：
     - 展示策略字段 `sortField` 的 `name` 标签改为“文件名称”。

2. **文案统一范围**
   - 检查并替换项目内排序方式“名称”文案（仅 UI 与当前迭代文档，不改历史归档快照）。
   - 不改值 `name`、不改解析逻辑。

3. **`work-tree-engine` 对齐验证**
   - 该引擎已有 `sortField/sortDirection` 逻辑，无需重写。
   - 补测试确保“目录策略启用后”输出顺序与预期一致，防止后续回归。

## 详细实现步骤

1. **接入当前目录排序规则到 UI 列表**
   - 在 `VfsMainScreen` 增加 `resolveDirectoryListRule(directoryPath)`。
   - 重构 `listDirectoryEntries` 排序比较器，支持：
     - 字段：`name | ctime | mtime`
     - 方向：`asc | desc`
     - 目录优先不变。

2. **更新排序方式文案**
   - 将展示策略中 `name` 选项标签改为“文件名称”。
   - 扫描其余相关排序文案并统一。

3. **即时生效保障**
   - 保持现有 `onInputDialogConfirm -> updateScopedWorkTree -> syncReactiveWorkTree` 链路；
   - 确认 `directoryEntries` computed 在 `currentWorkTree` 更新后自动重算并重排。

4. **测试补强**
   - `vfs-ui-cr-loop.spec.ts`：
     - 断言排序方式文案为“文件名称”
     - 提交排序策略后列表顺序即时变化（无需切目录/重开）
   - `work-tree-engine.spec.ts`：
     - 增加/调整用例验证 `sortField/sortDirection` 影响输出顺序。

5. **回归验证**
   - 运行目标测试与构建，确保未影响菜单、弹窗、列表交互稳定性。

## 测试策略

### 测试用例

1. **文案一致性**
   - 展示策略排序方式显示：“文件名称 / 创建时间 / 更新时间”。

2. **UI 列表即时重排**
   - 在 `/docs` 修改排序字段与方向并点击“确定”后，
   - `vfs-file-manager-list` 中文件行顺序立刻变化。

3. **作用域与目录边界**
   - 仅当前目录应用排序；其他目录保持原排序。

4. **渲染输出一致性**
   - `renderVirtualWorkTree` 在对应规则下输出顺序与字段/方向一致。

5. **非目标回归**
   - 目录优先规则不变；
   - `head/tail/fill` 现有行为不变。

## 风险与回滚方案

- **风险 1：列表排序与导航认知冲突**
  - 处理：明确保持“目录优先”，仅调整同类内部排序。

- **风险 2：UI 与渲染排序规则分叉**
  - 处理：UI 读取与渲染同一 `DirectoryRule` 字段集合，并补双侧测试。

- **风险 3：文案全量替换误伤历史文档**
  - 处理：仅改运行时 UI 与当前迭代文档，不修改 archive 历史快照。

- **回滚方案**
  - 回滚 `VfsMainScreen` 列表排序接入改动与文案替换；
  - 保留测试变更用于定位偏差；
  - 若需紧急恢复，仅撤销 UI 列表排序改造，不影响持久化结构与渲染引擎。
