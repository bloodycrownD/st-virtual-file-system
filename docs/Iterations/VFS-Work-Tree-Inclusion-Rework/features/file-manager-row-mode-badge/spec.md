# 文件管理器列表行：纳入方式 / 目录规则 角标 技术规格（SPEC）

## 设计目标

- 落实 [`prd.md`](./prd.md)：在 **`.vfs-fm-item` 内最右侧**展示 **图标 + 极短中文**；文件三态 **纳入 / 排除 / 随目录**；目录 **规则·开 / 规则·关**；与现有暗色行、灯泡、`vfs-fm-path-text` 的 **muted** 风格一致。
- **零业务语义分叉**：纳入方式与 `fileInclusionByPath` 稀疏缺省规则一致；目录与 `directoryRuleEnabledByPath` + 根恒开一致（与 [`VfsMainScreen.vue`](../../../../../src/app/screens/business-screens/VfsMainScreen.vue) 现有 `isEntityRowLit` 同源数据）。
- **不**改持久化、`toggle-status`、宏与工作树引擎的纳入判定逻辑（仅 UI 呈现）。

---

## 现状约束（代码阅读结论）

| 位置 | 现状 | 约束 |
|------|------|------|
| [`VfsFileManagerPanel.vue`](../../../../../src/app/components/business-components/VfsFileManagerPanel.vue) | `.vfs-fm-item` 为 `display:flex`；子节点为 `.vfs-fm-kind` + `.vfs-fm-name`（`flex:1` + `ellipsis`）；无右侧槽位 | 需**不拆行**增加右侧角标区；名称区须 `min-width:0` 以免挤压角标 |
| [`VfsMainScreen.vue`](../../../../../src/app/screens/business-screens/VfsMainScreen.vue) `directoryEntries` | 已为每行设置 `enabled`、`statusHintTitle/Aria`；文件用 `isFileIncludedInWorkTree`，目录用 `directoryRuleEnabledByPath` | 角标数据应在此 `computed` 内一次性算出，避免面板内再读 store |
| [`work-tree-engine.ts`](../../../../../src/domain/work-tree/work-tree-engine.ts) | `getFileInclusionMode(config, path)` 为 **非导出** 私有函数；`resolveWorkTreeFileRowState` 已用 **规范化 path** 查表 | UI 若手写 `fileInclusionByPath[path]` 易与引擎 **路径规范化** 漂移；**推荐导出**薄封装供 Vue 使用 |

**消费者**：仅 [`VfsMainScreen.vue`](../../../../../src/app/screens/business-screens/VfsMainScreen.vue) 挂载 [`VfsFileManagerPanel`](../../../../../src/app/components/business-components/VfsFileManagerPanel.vue)（`files` 列表态）；模板 / 聊天共用同一组件路径。

---

## 总体方案

1. **域层（极小）**：在 `work-tree-engine.ts` 导出 **`getWorkTreeFileInclusionMode(snapshot, config, filePath)`** 或仅 **`getWorkTreeFileInclusionMode(config, filePath)`**（若不需要 snapshot 则后者足够；当前引擎内 `getFileInclusionMode` 仅需 `config` + 已 `normalizePath` 的 key）。实现为对 `ensureWorkTreeConfig(config)` + `normalizePath(filePath)` 后读 `fileInclusionByPath`，缺省 **`follow-parent`**，与 `resolveWorkTreeFileRowState` 一致。在文件头 **TSDoc** 说明用途（UI 角标专用、非持久化）。
2. **数据**：扩展 `VfsBrowserEntity`（`VfsFileManagerPanel.vue` 内 interface）可选字段：  
   - `rowBadgeIconClass?: string` — 完整 `class` 字符串（含 `fa-solid`），便于模板 `:class` 绑定。  
   - `rowBadgeLabel?: string` — 短中文（纳入 / 排除 / 随目录 / 规则·开 / 规则·关）。  
   - `rowBadgeTitle?: string`、`rowBadgeAria?: string` — 完整说明（PRD 验收 3）。  
   - 可选：`rowBadgeTone?: 'default' | 'positive' | 'negative' | 'muted'` — 若需对「排除」略降饱和，否则单一 muted 即可。
3. **模板**：`.vfs-fm-item` 内改为 **左组 + 右组**：  
   - 左：`.vfs-fm-item-main` 包裹 `kind` + `name`（`flex:1 1 auto; min-width:0`）。  
   - 右：`.vfs-fm-row-badge`（`flex:0 0 auto; display:inline-flex; align-items:center; gap:4px`），内含 `<i>` + `<span>`；`v-if="entry.rowBadgeLabel"` 避免无数据时占位。  
   - `data-testid="vfs-fm-row-badge"` 便于测试。
4. **样式**：角标文字 `font-size: 11px–12px`，`color: rgba(255,255,255,0.45)` 量级；图标 `font-size: 12px`；**无**独立大背景条（可与一行边框融合）；`white-space: nowrap`。
5. **`VfsMainScreen`**：在 `directoryEntries` 的 `map` 分支内：  
   - **文件**：`mode = getWorkTreeFileInclusionMode(cfg, entry.path)`，映射到 icon + 短标签 + title/aria（见下表）。  
   - **目录**：`ruleOn` 与现有灯泡逻辑相同（`entry.path === ROOT_PATH || cfg.directoryRuleEnabledByPath[entry.path] === true`），映射 **规则·开 / 规则·关**。

### 图标与文案（实现时写死为一表，附在 `VfsMainScreen` 或小型 `vfsFmRowBadge.ts` 常量）

| 场景 | `rowBadgeLabel` | 建议 `rowBadgeIconClass` | `title` / `aria-label` 要点 |
|------|-----------------|---------------------------|------------------------------|
| `explicit-include` | 纳入 | `fa-solid fa-bookmark`（或 `fa-file-circle-check`，全仓统一即可） | 显式纳入工作树 |
| `explicit-exclude` | 排除 | `fa-solid fa-ban` 或 `fa-circle-minus` | 显式排除，不纳入工作树 |
| `follow-parent` | 随目录 | `fa-solid fa-diagram-project` 或 `fa-sitemap` | 随父目录规则（由当前目录纳入规则决定） |
| 目录规则开 | 规则·开 | `fa-solid fa-toggle-on` | 目录纳入规则：已启用 |
| 目录规则关 | 规则·关 | `fa-solid fa-toggle-off` | 目录纳入规则：未启用 |

**根目录实体行**：若列表中出现 `path === '/'` 的目录行（视现有 `listDirectoryEntries` 是否产出），`规则·开` 与 `isEntityRowLit` 恒开一致。

---

## 最终项目结构

```
src/domain/work-tree/
  work-tree-engine.ts          # 导出 getWorkTreeFileInclusionMode（+ TSDoc）
src/app/components/business-components/
  VfsFileManagerPanel.vue      # VfsBrowserEntity 扩展 + 模板/CSS
src/app/screens/business-screens/
  VfsMainScreen.vue            # directoryEntries 填充角标字段
test/
  vfs-ui-cr-loop.spec.ts       # 或新建 vfs-file-manager-panel.spec.ts：断言角标 data-testid / 文本（按需）
```

---

## 变更点清单

| # | 文件 | 变更 |
|---|------|------|
| 1 | `work-tree-engine.ts` | 导出 `getWorkTreeFileInclusionMode`；内部复用现有 `normalizePath` + `ensureWorkTreeConfig` 与稀疏缺省语义。 |
| 2 | `VfsFileManagerPanel.vue` | 扩展 `VfsBrowserEntity`；`.vfs-fm-item` 布局；角标 DOM + scoped 样式；`data-testid="vfs-fm-row-badge"`。 |
| 3 | `VfsMainScreen.vue` | `directoryEntries` 内为文件/目录写入角标字段；import 新导出函数。 |
| 4 | `test/...` | 至少一条用例覆盖「随目录」与「规则·关」可见性（mount `VfsFileManagerPanel` + mock `entries` 即可，无需全 `VfsMainScreen`）。 |

---

## 详细实现步骤

1. **引擎导出**：实现并导出 `getWorkTreeFileInclusionMode`；单测可在 `work-tree-engine.spec.ts` 加 1～2 条（规范化 path、缺省 follow-parent）。  
2. **面板结构与类型**：改 `VfsBrowserEntity` + 模板 + CSS；确认单击/双击仍绑定在 `.vfs-fm-item` 上（事件目标可为子元素，**冒泡不变**）。  
3. **主屏数据**：`directoryEntries` 合并角标；避免在模板中调用重型函数（保持 `computed` 内 O(n) 每文件一次查表）。  
4. **视觉走查**：长文件名 + 窄弹窗；角标不被裁切。  
5. **测试**：组件级最小断言（标签 + `data-testid`）。

---

## 测试策略

### 测试用例（映射 PRD 表）

| ID | 断言 |
|----|------|
| UT-B1 | `mount(VfsFileManagerPanel, { entries: [{..., rowBadgeLabel: '随目录', rowBadgeIconClass: 'fa-solid fa-sitemap', ...}] })` → 存在 `[data-testid=vfs-fm-row-badge]` 且文本含「随目录」 |
| UT-B2 | 同上，`rowBadgeLabel: '规则·关'` |
| UT-B3 | `getWorkTreeFileInclusionMode(ensureWorkTreeConfig(cfg), '/a.txt')` 在稀疏缺省下为 `follow-parent`；写入 `explicit-include` 后为 `explicit-include` |

### 手动

- 三态文件 + 开/关目录各一行；检查 `title` 悬浮全文。

---

## 风险与回滚方案

| 风险 | 缓解 | 回滚 |
|------|------|------|
| 窄宽下仍挤压 | `min-width:0` + 角标 `flex-shrink:0` + 角标 `max-width` 不设或设合理上限 | 仅 CSS revert |
| 图标与灯泡语义混淆 | 角标 muted、灯泡保持高对比 | UI revert |
| 路径规范化不一致 | 统一用导出 `getWorkTreeFileInclusionMode` | 单提交 revert |

---

**编码前请确认本 `spec.md`。** 若同意表中 **FA 图标具体选型** 或希望改为「目录不用 toggle 图标」，回复即可；确认后进入实现。
