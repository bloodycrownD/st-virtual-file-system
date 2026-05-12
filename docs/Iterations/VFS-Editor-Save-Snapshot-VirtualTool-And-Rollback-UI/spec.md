# VFS 编辑器保存 / 虚拟工具时机 / 回滚 UI — 技术规格（SPEC）

## 文档范围与状态

| 文档 | 路径 |
|------|------|
| 主需求 PRD | [`prd.md`](./prd.md) |
| 第二轮变更 PRD | [`features/editor-snapshot-toolbar-and-pipeline-diagnostics/prd.md`](./features/editor-snapshot-toolbar-and-pipeline-diagnostics/prd.md) |

**第一轮（已实现，代码基线）**

- **`message-pipeline.ts`**：已将 `MESSAGE_UPDATED` 与 `MESSAGE_RECEIVED` / `MESSAGE_EDITED` 一并纳入虚拟工具委托（见文件头注释与第 63–67 行 kind 门闸）。
- **`ChatVfsSnapshotService.persistChatFileSaveWithPreSnapshot`**：chat 保存单事务写入快照 + 文件。
- **`VfsMainScreen.vue`**：编辑器 header 右侧 `vfs-preview-chrome-actions` 内含原生 `<select>`（`data-testid="editor-snapshot-select"`）+ 回滚；已移除 `EditorScreen` 侧栏历史区与独立「保存快照」相机按钮。
- **`EditorScreen.vue`**：仅编辑/预览/行号，无 History aside。

**第二轮（本 SPEC 的实现对象）**  
对齐变更 PRD：顶栏**左组**放置快照 listbox + 回滚；**替换原生 `<select>`** 为共享 listbox；**始终 console 诊断**并视情况修正**编辑类事件**下的正文选取顺序（`record.mes` vs `args[1]`）。

---

## 设计目标（第二轮）

1. **布局**：快照选择 + 回滚与 **`vfs-preview-back-button`** 同组左对齐；**`vfs-preview-file-title`** 不被遮挡，中间区域 `min-width:0` + `ellipsis` 保持可读。
2. **组件**：快照选择使用与 **`VfsActionInputDialog`** 中 `type === 'select'` 一致的 **combobox + listbox** 交互的**共享组件**；编辑器场景禁止原生 `<select>`。
3. **可观测性 + 正确性**：在**生产构建**也通过 `console` 输出结构化诊断（前缀统一，如 **`[st-vfs][vt-msg]`**）；并落实**编辑类 kind**（`MESSAGE_EDITED` / `MESSAGE_UPDATED`）下更可靠的**消息正文来源**策略，解决「仍读陈旧 `record.mes`、工具块不执行」类问题（与变更 PRD 一致）。

---

## 现状与代码约束（探索结论）

### 预览顶栏（`VfsMainScreen.vue`）

- 当前结构为：`header.vfs-preview-top-bar` → **返回** → **`p.vfs-preview-file-title`**（`flex` 默认参与分配）→ **`div.vfs-preview-chrome-actions`**（`margin-left: auto`）。
- 快照 `<select>` 与回滚按钮放在 **`chrome-actions` 内靠前位置**（约 1213–1247 行），与预览/保存等同一右组；`select` 有 `max-width: min(42vw, 22rem)`（`.vfs-preview-chrome-select`），在窄宽度或长标题时仍可能与标题**争用水平空间**，符合用户反馈「遮挡标题」。

### 自定义 listbox 参考实现

- **`VfsActionInputDialog.vue`**（约 88–172、256–305 行）：`openSelectKey`、`toggleListbox`、`onSelectTriggerKeydown`（Arrow/Enter/Escape/Tab）、`onClickOutside`、`role="combobox"` / `role="listbox"` / `aria-expanded` / `aria-activedescendant`、`.vfs-action-input-dialog__listbox-*` 样式。这是本轮抽取的**事实来源**。

### 消息管道（`message-pipeline.ts`）

- 正文 `currentText` 顺序为：`record.mes` → `record.message` → **`args[1]`**（第 77–80 行）。若 SillyTavern 在**保存瞬间**先触发回调、**后**写回 `chat[i].mes`，则 `record.mes` 可能仍为旧串，**不会回落到 `args[1]`**（因 `??` 仅在左侧为 `null`/`undefined` 时继续）。这与「已接 UPDATED 仍不生效」现象一致，第二轮需在 **EDITED/UPDATED** 上调整选取策略并打日志证实。

### 适配器（`st-event-adapter.ts`）

- `MESSAGE_EDITED` 与 `MESSAGE_UPDATED` 为不同字符串时各注册一条监听；同值时去重为一次 `onMessageEdited`。诊断日志应在 **`start()`** 末尾输出一次 **`et.MESSAGE_*` 解析到的实际字符串**（避免每次消息刷屏），并在**每条消息处理**日志中写逻辑 `kind`（`onMessageUpdated` → `MESSAGE_UPDATED`）。

---

## 总体方案（第二轮）

### 1. 顶栏三段布局

将 `vfs-preview-top-bar` 拆为三个子容器（类名实现阶段可微调）：

| 区域 | 内容 | CSS 要点 |
|------|------|----------|
| **左组** | 返回 + 快照 listbox + 回滚 | `display:flex; align-items:center; gap; flex:0 0 auto; flex-shrink:0` |
| **中组** | `vfs-preview-file-title` | `flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis`；与左组 `gap` 分离 |
| **右组** | 原 `vfs-preview-chrome-actions` 内**其余**按钮（预览切换、保存、幻灯片 prev/next） | 保留 `margin-left:auto` **仅作用于右组**，或右组整体 `margin-left:auto`，左+中先占位 |

从右组 **移除** 快照 `<select>` 与回滚按钮 DOM；在左组新增挂载点（如 `vfs-preview-top-bar__snapshot`）。

### 2. 共享 Listbox 组件

- **新建**（建议路径）：`src/app/components/pure-components/VfsListboxField.vue`（或 `business-components`，以与现有对话框样式复用为准）。
- **API（建议）**：`modelValue: string`；`options: Array<{ label: string; value: string }>`；`placeholder?: string`；`disabled?: boolean`；`ariaLabel: string`；`teleportToBody?: boolean`（默认 `false`；header 内嵌即可）；`dataTestid?: string`（触发器，如 `editor-snapshot-listbox-trigger`）；弹出层可用 `data-testid` 后缀 `-listbox`。
- **行为**：对齐 `VfsActionInputDialog` 的键盘与点击外部关闭；样式可抽 scss 变量或复制并改名为 `vfs-listbox-field__*` 以免与对话框内边距冲突。
- **重构 `VfsActionInputDialog`**：**优先**用新组件替换内联 listbox 分支（减少双份逻辑）；若一次改动风险高，允许先 **仅 `VfsMainScreen` 接入**，对话框在跟进提交中替换（须在 SPEC「变更点清单」标注为 Partial 完成条件）。

### 3. 消息正文选取 + 诊断日志

#### 3.1 正文选取（编辑类事件）

- 新增纯函数（建议）：`src/app/services/message/resolve-virtual-tool-message-text.ts` — `export function resolveVirtualToolMessageText(kind, record, args): string | undefined`。
- **规则**：
  - `MESSAGE_RECEIVED`：**保持现状**（`mes` → `message` → `args[1]`）。
  - `MESSAGE_EDITED` / `MESSAGE_UPDATED`：若 `typeof args[1] === 'string' && args[1].length > 0`，**优先** `args[1]`；否则回退 `mes` → `message`。
- **`message-pipeline.ts`**：`currentText` 改为调用该函数；单元测试覆盖「`mes` 旧、`args[1]` 新 → 应用新串」。

#### 3.2 诊断日志（始终 console）

- 新增薄模块（建议）：`src/app/services/message/vfs-virtual-tool-pipeline-diag.ts`，导出 `logVtPipeline(event: string, payload: Record<string, unknown>)`，内部 **`console.log('[st-vfs][vt-msg]', event, payload)`**（或单行 JSON），**禁止**默认打印完整 `messageText`；允许字段：`kind`、`stEvent`（若上层传入）、`messageIndex`、`textSource`（`'args[1]'` \| `'mes'` \| `'message'` \| `'none'`）、`textLen`、`hasVirtualToolCall`、`enteredHandler`、`handled`、`skipReason?`。
- **调用点**：
  - `message-pipeline.ts`：`processMessage` 入口（kind、index）、选取正文后（textSource、摘要字段）、`handler.process` 返回后（handled）。
  - `st-event-adapter.ts`：`start()` 完成注册后 **一次性** `logVtPipeline('adapter-start', { registeredEditEvents: [...], received: et.MESSAGE_RECEIVED, ... })`（仅字符串常量，不含闭包敏感信息）。
  - `VirtualToolMessageHandler.process`（可选但推荐）：在 `handled:false` 的早退路径打 `skipReason`（`lock`、`no-call`、`multi-result`、`disabled`），便于与管道日志串联。

---

## 最终项目结构

```text
src/app/
  components/
    pure-components/
      VfsListboxField.vue          # 新建（或等价命名）
    business-components/
      VfsActionInputDialog.vue      # 改为复用 VfsListboxField（优先）
  services/
    message/
      message-pipeline.ts           # 改：resolve 文本 + 诊断
      resolve-virtual-tool-message-text.ts  # 新建
      vfs-virtual-tool-pipeline-diag.ts       # 新建
  screens/business-screens/
    VfsMainScreen.vue               # 改：顶栏三段 + 接入 listbox
  infra/sillytarvern/events/
    st-event-adapter.ts             # 改：adapter-start 诊断
  .../virtual-tool-message-handler.ts  # 改（可选）：skip 诊断

test/
  resolve-virtual-tool-message-text.spec.ts  # 新建
  message-pipeline-virtual-tool.spec.ts       # 增补选取顺序 + log spy
  vfs-listbox-field.spec.ts                  # 新建（最小交互）
  vfs-ui-cr-loop.spec.ts                      # 更新 testid / DOM 路径
  （如存在）VfsActionInputDialog 相关测例更新
```

---

## 变更点清单

| 文件 | 变更 |
|------|------|
| `VfsMainScreen.vue` | 顶栏 DOM/CSS 三段；快照用 `VfsListboxField`；移除 `<select>`；`data-testid` 与测试对齐 |
| `VfsListboxField.vue` | **新建** listbox |
| `VfsActionInputDialog.vue` | **优先**内联 select 改为 `VfsListboxField` |
| `resolve-virtual-tool-message-text.ts` | **新建** |
| `vfs-virtual-tool-pipeline-diag.ts` | **新建** |
| `message-pipeline.ts` | 接入 resolve + diag |
| `st-event-adapter.ts` | `adapter-start` 一次性 diag |
| `virtual-tool-message-handler.ts` | 可选 skip diag |
| `test/*` | 见测试策略 |

---

## 详细实现步骤

1. **diag 模块**：实现 `logVtPipeline`，约定字段集合；禁止完整正文。
2. **resolve 模块**：实现并单测 `MESSAGE_EDITED`/`UPDATED` + `args[1]` 优先。
3. **message-pipeline**：替换 `currentText` 计算；插入 diag；保留 `SillyTavern` 未定义错误路径。
4. **st-event-adapter**：`start()` 末尾打印已注册的 `MESSAGE_*` 字符串映射（数组形式即可）。
5. **VfsListboxField**：实现 + 样式 + `data-testid`；从 `VfsActionInputDialog` 抽取/替换。
6. **VfsMainScreen**：左组插入 listbox + 回滚；右组删除二者；调整 class；`.vfs-preview-chrome-actions` 的 `flex-wrap` 可按评审建议设为 `wrap` 以改善极窄屏。
7. **VirtualToolMessageHandler**（可选）：`skipReason` 日志。
8. **全量测试与 build**。

---

## 测试策略

### 测试用例

1. **`resolve-virtual-tool-message-text.spec.ts`**：`EDITED` + `mes` 旧 + `args[1]` 含 `<virtual-tool-call>` → 返回 `args[1]`；`RECEIVED` 仍优先 `mes`。
2. **`message-pipeline-virtual-tool.spec.ts`**：spy `console.log`，断言含 `[st-vfs][vt-msg]`、`handled`、`textSource`；mock handler。
3. **`VfsListboxField` / 对话框**：打开、选一项、`modelValue` 更新、Escape 关闭（新文件或扩展现有组件测）。
4. **`vfs-ui-cr-loop.spec.ts`**：进入 editor 后，快照控件为 **listbox trigger**（新 `data-testid`）；**不存在** `select[data-testid="editor-snapshot-select"]`；断言触发器在**返回按钮**所在左组容器内（可通过 `wrapper.get('[data-testid="vfs-preview-back"]')` 的 `element.parentElement` 包含关系或给左组加 `data-testid="vfs-preview-top-bar-left"` 辅助断言）。
5. **回归**：`npm test`、`npm run build`。

---

## 风险与回滚方案

| 风险 | 缓解 |
|------|------|
| 某 ST 版本 `args[1]` 不是正文 | 日志中带 `typeof args[1]` 与长度；必要时再收窄「仅当包含 `<virtual-tool-call>` 时 args 优先」 |
| Listbox 在窄 header 溢出 | `max-width` + `min-width:0` 中组标题；左组 `max-width` 可选 cap |
| 对话框重构引入回归 | 分提交：先新组件 + MainScreen，再对话框替换；每步跑测 |

**回滚**：按提交 revert；无 schema 变更。

---

## 与主 PRD / 第一轮 SPEC 的关系

- 主 PRD 中「header 同行控件」已由第一轮满足；第二轮**细化**为「左组 + 自定义 listbox + 诊断与正文选取修正」，**不**推翻「保存即快照」「单事务」等已交付行为。

---

**文档路径**：`docs/Iterations/VFS-Editor-Save-Snapshot-VirtualTool-And-Rollback-UI/spec.md`

请确认本 `spec.md`（含第二轮范围）是否可作为实现与评审的唯一事实来源；确认后再进入编码。
