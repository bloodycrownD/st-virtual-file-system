# VFS 工作树纳入模型重构 技术规格（SPEC）

## 设计目标

- 对齐 [`prd.md`](./prd.md)：**灯（文件行）= 是否纳入工作树**，与 `{{VIRTUAL_WORK_TREE}}` 宏输出是否包含该文件块**一致**；**目录纳入规则**仅影响纳入方式为「随父目录规则」的直接子文件。
- **不兼容旧持久化语义**：检测到旧版 `workTree` 形状时**不**做字段级迁移；以「空白新模型 + 明确默认」替代（与 PRD「不保留技术债式双轨」一致）。
- **单一计算源**：宏渲染与 UI 列表 `enabled` 共用同一套纯函数（或同一模块导出的 API），禁止 `VfsMainScreen` 再维护一套与 `work-tree-engine` 分叉的判定。

### 已决产品规则（实现须遵守）

1. **显式纳入**：恒为**全文**（`renderMode: 'full'`），不提供弱纳入档位。  
2. **FrontMatter 解析失败**（仅 **Markdown** 扩展名 `.md` / `.markdown`，且本次输出形态为 frontmatter 时）：**仍纳入工作树**（`included: true`，灯亮）；宏中**仍有**该文件的 `<file>...</file>` 块，正文为**降级展示**：**`文件名<basename>，FrontMatter解析失败`**（使用与现引擎一致的 `numberedBody` 行块格式，例如单行 `1|文件名foo.md，FrontMatter解析失败`）。**非 Markdown 文件**在「仅文件名」类展示下**只展示文件名**，**不得**附加「FrontMatter解析失败」文案（与现逻辑一致：`fill: 'frontmatter'` 不对非 md 套 frontmatter 模式）。  
3. **`overwriteChatWithTemplate`**：覆盖聊天快照时**同时重置** `chat.workTree` 为 `extension.workTreeTemplate` 的解析结果；若模板侧工作树为 `null` 或旧 schema，则落 **`schemaVersion: 2` 默认新配置**（与 `ensureWorkTreeConfig` 默认一致），不得保留覆盖前 chat 内旧工作树。
- **根目录**：提供与非根一致的**目录纳入规则**配置入口；**无「关闭规则」**；默认 **`headCount = 1000`**（与现有 `DirectoryRule` 上界 1000 一致，等价「该目录下子文件在头批语义下全覆盖」）；`tailCount` / `fill` 默认值在实现阶段与 PRD「由 SPEC 对齐」锁定为与当前 `DEFAULT_DIRECTORY_RULE` 或产品裁定一致（建议：`tailCount: 0`，`fill: 'omit'` 仅作用于头尾并集之外的「随父目录规则」文件，与现引擎一致）。

---

## 现状约束（基于代码阅读）

| 区域 | 现状 | 与本需求冲突点 |
|------|------|----------------|
| [`work-tree.types.ts`](../../../src/domain/work-tree/work-tree.types.ts) | `WorkTreeConfig`：`defaultRule`、`directoryOverrides`、`directoryRulesEnabled`、`selectedFiles` | `selectedFiles` 与目录规则**分阶段**写入 `modes`（[`buildRenderModes`](../../../src/domain/work-tree/work-tree-engine.ts)），导致「未勾选但宏仍有」；与本 PRD 矛盾。 |
| [`work-tree-engine.ts`](../../../src/domain/work-tree/work-tree-engine.ts) | `renderVirtualWorkTree` → `buildRenderModes` + `buildEmissionOrder` + `renderOneFile` | 需改为「按文件纳入方式 + 父目录门闸 + 规则」统一推导 `Map<path, RenderMode \| omit>`；未纳入路径不出现在 `order` 或不出块。 |
| [`VfsMainScreen.vue`](../../../src/app/screens/business-screens/VfsMainScreen.vue) | `isEntityEnabled`：文件看 `selectedFiles`，目录看 `directoryRulesEnabled`；`toggle-status` 切换上述二者；`openDisplayStrategyDialogForCurrentDirectory` 写 `directoryOverrides` 并设 `directoryRulesEnabled[path]=true`；`includeDisplayStrategy: isNonRootDirectory` | 文件灯必须改为**推导的纳入结果**；根目录需**目录纳入规则**配置入口；根目录**无关闭规则**交互。 |
| [`VfsFileManagerPanel.vue`](../../../src/app/components/business-components/VfsFileManagerPanel.vue) | 行状态槽位统一灯泡 `entry.enabled` | 文件：二态纳入；目录：PRD 称无「展示/不展示」——建议目录行改为**规则启用**语义（文案/ `title` / `aria-label`）或拆图标，避免用户以为目录「纳入工作树」。 |
| [`VfsActionMenu.vue`](../../../src/app/components/business-components/VfsActionMenu.vue) | `includeDisplayStrategy` 控制 header 是否出现 `apply-strategy` | 根目录需为 `true`（与当前 `isNonRootDirectory` 相反）。 |
| [`register-vfs-macros.ts`](../../../src/infra/sillytarvern/macros/register-vfs-macros.ts) | `VIRTUAL_WORK_TREE` 读 `chatVfsSnapshot` + `workTree` | 将 `workTree`（可为持久化 `null`）传入 `renderVirtualWorkTree`；引擎内 **`ensureWorkTreeConfig`**，与 UI 默认一致（**非**「null 必空串」）。 |
| [`vfs-chat-metadata.schema.ts`](../../../src/infra/persistence/vfs-chat-metadata.schema.ts) / [`vfs-extension-settings.schema.ts`](../../../src/infra/persistence/vfs-extension-settings.schema.ts) | `workTree` / `workTreeTemplate` 经 `parseWorkTreeConfig` | 解析层需**识别新 schema**；旧形状**丢弃或整表重置**为默认新配置（实现二选一，见下文）。 |
| [`extension-vfs-template-service.ts`](../../../src/app/services/vfs-runtime/extension-vfs-template-service.ts) | 初始化 chat 时 `workTree: workTreeTemplate ?? draft.workTree`；`overwriteChatWithTemplate` 仅替换快照 | **已定案**：`overwriteChatWithTemplate` 须**同时**将 `chat.workTree` 重置为模板工作树（或默认新配置）；与下节「已决产品规则」第 3 条一致。 |
| [`test/work-tree-engine.spec.ts`](../../../test/work-tree-engine.spec.ts) | 覆盖 head/tail、selected 优先、目录未启用等 | 全部改为新语义用例；增加 PRD 头批与灯一致（以**纳入推导**断言；UI 可另加 `vfs-ui` 测）。 |

---

## 总体方案

### 1. 持久化模型（建议）

在 **`workTree` / `workTreeTemplate` JSON 对象上增加版本字段**（避免另开 `workTreeV2` 键导致 ST 元数据分裂），例如：

- `schemaVersion: 2`（数字；缺失或 `<2` 视为旧版，**整对象按新默认重建**）。
- **`fileInclusionByPath`**：`Record<VfsPath, 'explicit-include' | 'explicit-exclude' | 'follow-parent'>`，**稀疏存储**：缺省键 = **`follow-parent`**（与 PRD 默认一致）。
- **`directoryRuleByPath`**：`Record<VfsPath, DirectoryRule>` — 复用现有 [`DirectoryRule`](../../../src/domain/work-tree/work-tree.types.ts) 结构（`sortField` / `sortDirection` / `headCount` / `tailCount` / `fill`），语义为「该目录作为父目录时使用的纳入规则内容」。
- **`directoryRuleEnabledByPath`**：`Record<VfsPath, boolean>` — **仅非根路径**有意义；**根路径 `/` 不得持久化为 `false`**（解析时丢弃 `false`）。UI 上不展示根目录「关闭规则」。

**默认新配置**（新建 chat / 模板 / 解析失败回退）建议：

- `schemaVersion: 2`
- `directoryRuleByPath['/']`：`{ sortField: 'name', sortDirection: 'asc', headCount: 1000, tailCount: 0, fill: 'omit' }`（`fill` 与 PRD 对齐意图：头批外默认不纳入；若产品希望根下「头批外仍 filename」可改默认并更新 PRD）。
- `fileInclusionByPath: {}`
- `directoryRuleEnabledByPath`：空对象（非根目录默认**未启用**规则 → 「随父目录规则」子文件**不纳入**，与 PRD 一致）。

> 命名可在实现时内聚为 `WorkTreeConfig` 同文件名内重导出，但**禁止**继续沿用 `selectedFiles` 表达「显式纳入」语义，避免双轨。

### 2. 纯函数核心（域层）

在 **`work-tree-engine.ts`（或拆 `work-tree-inclusion.ts` + 由 engine 调用）** 实现：

1. **`resolveWorkTreeFileRowState(snapshot, config, filePath): { included: boolean; renderMode: 'full' | 'filename' | 'frontmatter' }`**  
   - `explicit-exclude` → `included: false`（宏无块；灯灭）。  
   - `explicit-include` → `included: true`，`renderMode: 'full'`（**已确认**：恒为全文）。  
   - `follow-parent`：取**直接父目录** `parentPath`：  
     - 若 `parentPath === '/'`：恒视为规则启用，规则取 `directoryRuleByPath['/']` 缺省回退默认根规则。  
     - 若为非根：若 `directoryRuleEnabledByPath[parentPath] !== true` → `included: false`。  
     - 否则：在该父目录的**直接子文件**集合上，复用现有排序、`pickHeadTailPaths`、fill 分支语义，**但仅对 `follow-parent` 文件参与集合划分**；显式纳入/排除文件**不参与**头尾排队列占位（PRD：规则只作用于随父目录规则者）。  
   - **`renderMode === 'frontmatter'` 且文件为 Markdown**：`included` **恒为 true**（只要规则将该文件置于 frontmatter 输出档位）；**不因** `frontMatterDisplayLines` 解析失败而改为 `false`（与「灯亮、宏有块」一致）。  
   - **`renderMode === 'filename'`**（非 Markdown 或规则为 filename）：`included: true` 时仅文件名形态；**不得**拼接「FrontMatter解析失败」。

2. **`renderOneFile` / 宏块生成**  
   - 当 `renderMode === 'frontmatter'` 且 `frontMatterDisplayLines(text)` 为 `null`：不得返回 `null`；改为输出标准 `<file ...>` 外壳，正文为 **`numberedBody`** 包一层，推荐**单行**字面：`文件名` + `basename(path)` + `，FrontMatter解析失败`（与产品描述一致；须稳定、可测）。  
   - 当 `renderMode === 'filename'`：保持现有仅 basename 行块；**不**含 FrontMatter 失败提示。

3. **`renderVirtualWorkTree(snapshot, config)`**  
   - 先枚举快照中所有**文件**路径（或按树序收集），用 `resolve...` 得到 `included` + `renderMode`；构建 `modes` Map（仅 `included`）与 emission order（与现 `buildEmissionOrder` 类似，但 `modes` 来源变更）。  
   - **保证**：对任意文件路径，`included === true` **当且仅当**宏拼接结果中出现该 `path="..."` 块（含 frontmatter 解析失败时的**降级块**）。

4. **导出**供 UI：`export function isFileIncludedInWorkTree(...): boolean`（薄封装，`included` 与灯一致）避免 Vue 侧复制逻辑。

### 3. UI 层（`VfsMainScreen` + 菜单 + 面板）

- **`directoryEntries` 中 `enabled`**：  
  - **文件**：`resolveWorkTreeFileRowState(...).included`。  
  - **目录**：不表示「纳入工作树」；建议改为 `ruleEnabled: boolean` 供面板使用，或继续用 `enabled` 但 **title/aria** 明确为「目录规则已启用」（根目录固定 `true` 且可 `aria-readonly`）。  
- **`toggle-status`**：  
  - **文件**：在三态间切换（建议顺序：`follow-parent` → `explicit-include` → `explicit-exclude` → `follow-parent`，或打开子菜单；**实现需可测**）。  
  - **非根目录**：仅切换 `directoryRuleEnabledByPath[path]`（不再与文件 `selectedFiles` 混用）。  
  - **根目录**：**不提供** `toggle-status` 关闭规则；若当前 UI 对根目录也展示目录菜单，需隐藏「关闭规则」项或禁用。  
- **目录纳入规则弹窗**：预填 `directoryRuleByPath[currentDirectory] ?? 默认根规则或全局默认`；提交写回 `directoryRuleByPath`；非根且首次保存可置 `directoryRuleEnabledByPath[path]=true`（与现行为类似）。根目录仅更新规则内容。  
- **`includeDisplayStrategy`**：改为 **`true` 包含根目录**（或始终展示「目录纳入规则」菜单项，仅在 `currentPath === '/'` 时禁用「关闭规则」类子项——由实现选一种）。

### 4. 解析与兼容策略

- **`parseWorkTreeConfig`**（或新函数 `parseWorkTreeConfigV2` 在 types 中）：  
  - 若 `schemaVersion >= 2` 且对象含预期字段 → 解析为强类型。  
  - 否则（旧版有 `selectedFiles` 等）：**返回 `null`**，`ensureWorkTreeConfig` 创建**全新默认 `schemaVersion: 2`**，并可由上层 **toast 一次性提示**「工作树配置已按新版本重置」（文案非 PRD 必须，建议有）。  
- **序列化**：始终写出 `schemaVersion: 2` 与新字段；**不再写出** `selectedFiles` / 旧 `directoryRulesEnabled` 键名（或明确禁止混写）。

---

## 最终项目结构

不强制新建包；预期 touched 文件：

```
src/domain/work-tree/
  work-tree.types.ts          # 新 WorkTreeConfig 形状、parse/serialize、默认工厂
  work-tree-engine.ts         # renderVirtualWorkTree + inclusion 解析重构
src/app/screens/business-screens/
  VfsMainScreen.vue           # read/write work tree、列表 enabled、弹窗、根入口
src/app/components/business-components/
  VfsFileManagerPanel.vue     # 可选：目录行文案/图标
  VfsActionMenu.vue           # includeDisplayStrategy 根目录
src/infra/persistence/
  vfs-chat-metadata.schema.ts # 若 parse 入口需显式分支
  vfs-extension-settings.schema.ts
src/infra/sillytarvern/macros/
  register-vfs-macros.ts      # 仅类型/import 适配（若 workTree 类型变）
test/
  work-tree-engine.spec.ts    # 重写 + 新增用例
  （按需）vfs-ui / persistence 单测
```

---

## 变更点清单

| 序号 | 文件 | 变更摘要 |
|------|------|----------|
| 1 | `work-tree.types.ts` | 定义 `schemaVersion: 2` 与 `fileInclusionByPath` / `directoryRuleByPath` / `directoryRuleEnabledByPath`；`parseWorkTreeConfig` 旧形状返回 `null`；`serializeWorkTreeConfig` 新形状；默认根规则 `headCount: 1000`。 |
| 2 | `work-tree-engine.ts` | 重写 `buildRenderModes` 等价逻辑为三态 + 父目录门闸；导出 `isFileIncludedInWorkTree` 或 `resolveWorkTreeFileRowState`；`buildEmissionOrder` 与排序规则数据源改为新 config（根恒启用；非根未启用时列表排序仍可用「仅 name asc」与现 `resolveDirectoryListRule` 对齐）。 |
| 3 | `VfsMainScreen.vue` | 所有 `selectedFiles` / `directoryRulesEnabled` / `directoryOverrides` / `defaultRule` 引用迁移；`isEntityEnabled` 用域函数；`replaceWorkTreePaths` / `removeWorkTreePaths` 迁移路径键；`openDisplayStrategyDialogForCurrentDirectory` 读写新字段；根目录打开策略；`includeDisplayStrategy` 传参。 |
| 4 | `VfsActionMenu.vue` + 调用方 | 根目录显示「目录纳入规则」入口。 |
| 5 | `VfsFileManagerPanel.vue` | 目录行 `title`/`aria-label` 区分「规则启用」vs 文件「纳入工作树」。 |
| 6 | `extension-vfs-template-service.ts` | 模板克隆新 schema；**`overwriteChatWithTemplate`** 在重置快照/日志/版本的同时，将 **`chat.workTree`** 设为 `workTreeTemplate` 解析结果或默认 `schemaVersion: 2` 配置。 |
| 7 | `register-vfs-macros.ts` | 仅当 `workTree` 类型签名变化时调整 import。 |
| 8 | `work-tree-engine.spec.ts` | 新用例覆盖 PRD：显式优先、非根规则关、根 head=3；**Markdown + frontmatter 解析失败**：灯语义为纳入、`renderVirtualWorkTree` 含该 path 且正文含 `FrontMatter解析失败`；**filename 模式**正文不含该失败提示。 |

---

## 详细实现步骤

1. **类型与解析先行**：新增默认工厂与 `parse`/`serialize`；单元测 `parse(旧对象) === null`、`parse(新对象)` 往返。  
2. **域引擎**：实现 `resolveWorkTreeFileRowState` + 重写 `renderVirtualWorkTree`；迁移 `work-tree-engine.spec.ts` 中所有旧用例到新配置写法。  
3. **UI 读写路径**：`VfsMainScreen` 全量替换；手动验证根目录菜单出现、根无关闭。  
4. **文件行三态切换**：实现 `toggle-status` 与持久化；根目录行行为确认。  
5. **面板与无障碍**：更新目录行文案；文件行保持灯泡二态。  
6. **集成验证**：`renderedWorkTreeText` 与列表灯 spot-check；宏 `VIRTUAL_WORK_TREE` 抽样。  
7. **发布说明**：注明工作树配置不兼容、需重新设定。

---

## 测试策略

### 单元测试（`work-tree-engine.spec.ts`）

- 旧配置形状 → `parseWorkTreeConfig` 返回 `null`；`ensureWorkTreeConfig` 默认根 `headCount === 1000`。  
- `follow-parent` + 非根父目录规则关 → 不纳入；宏无该 path。  
- `follow-parent` + 根下 + `head=3` + 固定子文件集 → 排序前三纳入，第四不纳入（`fill: omit`）。  
- `explicit-include` / `explicit-exclude` 与头批冲突用例（PRD 三条）。  
- `explicit-include` + 父规则关 → 仍纳入。  
- 多文件混合三态同目录，改规则仅 `follow-parent` 集合变化。  
- Markdown + `frontmatter` 档位 + 非法 frontmatter：`included === true`，输出块内含 **`文件名…，FrontMatter解析失败`**；`isFileIncludedInWorkTree` 为 `true`。  
- `filename` 档位：输出块仅 basename 行，**断言不含** `FrontMatter解析失败`。

### UI / 集成（按需）

- 组件测或 E2E：`data-testid="vfs-fm-row-status"` 对固定 `entries` mock 断言灯类名与 `included` 一致（若现有 harness 支持往 `directoryEntries` 注入）。

### 手动清单

- 根 `/` 打开「目录纳入规则」弹窗；无「关闭规则」。  
- 非根目录关闭规则后，仅 `follow-parent` 文件灯灭且宏无；显式纳入文件仍亮。  
- `head=3` 与 PRD 描述一致。

---

## 风险与回滚方案

| 风险 | 缓解 | 回滚 |
|------|------|------|
| 用户旧聊天工作树配置全部丢失语义 | 一次性 toast + README/发版说明 | 无自动回滚；依赖 Git 回退版本或用户备份元数据 |
| FrontMatter 降级文案需与 i18n/一致性对齐 | 宏内固定中文或由后续统一文案表驱动 | 文案单提交调整 |
| 目录行仍用灯泡被误解 | 改文案/图标 | UI-only revert |

---

**已定案**（见上文「已决产品规则」）：显式纳入恒全文；Markdown frontmatter 解析失败时灯亮且宏含降级块；`overwriteChatWithTemplate` 同步重置 `workTree`。进入编码前若仍有实现层歧义，仅修订本 SPEC 小节即可。
