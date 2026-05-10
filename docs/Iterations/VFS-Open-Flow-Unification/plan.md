# VFS-Open-Flow-Unification 设计方案

## 设计目标

- 将目录导航改为单击进入，降低交互成本。
- 将 row 菜单中的“查看/编辑”收敛为“打开”，统一文件/目录打开语义。
- 文件打开后进入 `editor` 模式且默认 `preview` 打开（`editorPreviewMode = true`）。
- 保持 chat/template、desktop/mobile 行为一致，不回归既有菜单稳定性（Teleport + outside dismiss）。

## 总体方案

基于当前代码现状：

- 列表行行为由 `VfsFileManagerPanel.vue` 决定（当前目录打开是 `@dblclick="open(entry)"`，且 `open()` 仅处理目录）。
- row 菜单动作定义由 `useVfsFileManagerModel.ts` 中的 `VfsEntityAction` 与 `FILE_ACTIONS` / `DIRECTORY_ACTIONS` 驱动。
- 真正动作执行在 `VfsMainScreen.vue -> handleEntityAction()`，目前：
  - `view` -> `reader`
  - `edit` -> `editor`
  - `open-slideshow` -> `slideshow`

本次采用“动作语义上收敛，渲染与执行双端同步”的方案：

1. 在动作模型层新增统一动作 `open`，移除 `view/edit` 出现在 row 菜单中的可能性。
2. 在列表行层将“目录打开”从双击切换为单击，并保持 row-action 区域点击不冒泡。
3. 在主屏执行层中将 `open` 分流：
   - 目录：进入目录（等价当前 `onOpened(path)`）
   - 文件：进入 `editor` 且默认 `editorPreviewMode = true`
4. 将测试中所有基于 `view/edit` 的触发路径切换到 `open`，并补充目录单击与文件双击默认预览断言。

## 最终项目结构

```text
docs/Iterations/VFS-Open-Flow-Unification/
  spec.md
  plan.md

src/app/
  composables/components-composables/
    useVfsFileManagerModel.ts          # 动作类型与可见动作集合
  components/business-components/
    VfsFileManagerPanel.vue            # row 点击/双击行为
    VfsActionMenu.vue                  # 动作文案映射（查看/编辑 -> 打开）
  screens/business-screens/
    VfsMainScreen.vue                  # open 动作执行、默认预览模式

test/
  vfs-ui-cr-loop.spec.ts               # 交互回归与行为断言更新
```

## 变更点清单

| 文件 | 变更类型 | 说明 |
|---|---|---|
| `src/app/composables/components-composables/useVfsFileManagerModel.ts` | 修改 | `VfsEntityAction` 增加 `open`；`FILE_ACTIONS` 去掉 `view/edit`，改为含 `open`；目录动作集合加入 `open`（并保留其他动作）。 |
| `src/app/components/business-components/VfsActionMenu.vue` | 修改 | `ACTION_LABELS` 去掉“查看/编辑”，新增 `open: 打开`。 |
| `src/app/components/business-components/VfsFileManagerPanel.vue` | 修改 | row 主体目录进入由双击改单击；保留文件双击事件透传给上层“打开文件”路径（通过 `entityActionRequested` 或新增 emit 统一）。 |
| `src/app/screens/business-screens/VfsMainScreen.vue` | 修改 | `handleEntityAction` 支持 `open`：目录进入路径、文件进入编辑并默认 `editorPreviewMode=true`；删除/停用 `view/edit` 菜单依赖路径。 |
| `test/vfs-ui-cr-loop.spec.ts` | 修改 | 把 `triggerEntityAction(..., 'view'/'edit', ...)` 相关用例迁移为 `open`；新增目录单击进入、文件双击默认预览断言。 |

## 兼容性或迁移说明

- 该变更只影响 row 菜单与列表行打开手势，不调整 header 全局菜单。
- `open-slideshow` 保持原目录扩展能力，不与 `open` 冲突；`open` 作为默认入口，`open-slideshow` 作为附加能力保留。
- `entity-actions` 菜单结构仍由 `VfsActionMenu` 承载，不触碰 Teleport 定位与 dismiss 生命周期，降低回归风险。

## 详细实现步骤

1. **动作模型收敛**
   - 更新 `VfsEntityAction` 联合类型，加入 `open`。
   - 更新 `FILE_ACTIONS` / `DIRECTORY_ACTIONS`，移除 `view/edit`，加入 `open`。
   - 确认 `isActionTriggerable()` 与可见动作逻辑无破坏。

2. **菜单文案与渲染调整**
   - 在 `VfsActionMenu.vue` 的 `ACTION_LABELS` 增加 `open: '打开'`。
   - 删除 `view/edit` 文案映射，确保 row 菜单不再出现旧动作。

3. **列表行为调整（目录单击）**
   - `VfsFileManagerPanel.vue` 将目录进入行为从 `@dblclick` 改为 `@click`（仅目录生效）。
   - 保持 `.vfs-fm-row-actions` 区域 `@click.stop`，防止点三点或状态图标误触目录打开。
   - 文件行不做单击打开，避免误触；保留双击文件进入打开流程（下一步实现）。

4. **主流程执行层统一 open**
   - `VfsMainScreen.handleEntityAction()` 添加 `case 'open'`：
     - `directory`：设置 `currentDirectoryPath` 并回到 list（等价现有 `onOpened`）。
     - `file`：进入 `editor`，并显式设置 `editorPreviewMode.value = true`。
   - 删除 `view/edit` 的菜单路径依赖；若保留旧 case 作为兼容分支，仅用于防御，不从菜单触发。

5. **文件双击打开**
   - 在 `VfsFileManagerPanel` 为文件双击触发 `entityActionRequested({action:'open'})`（或等效事件）；
   - 目录双击不再作为主入口（可保留兼容但不依赖）。

6. **测试迁移与补充**
   - 将现有用例里 `triggerEntityAction(..., 'edit'/'view', ...)` 迁移到 `open`。
   - 新增断言：
     - 目录单击后 path 变化；
     - 文件双击进入 `editor` 且 `editor-preview-toggle` 初始为“查看源码”语义（表示当前在预览模式）；
     - row 菜单不再包含“查看/编辑”，包含“打开”。

7. **验证执行**
   - 运行 `npm run build`
   - 运行 `npm run test:run`（当前脚本已是 build 后 test）
   - 若失败，优先修正手势事件冲突与测试选择器。

## 测试策略

### 测试用例

- **TC-1 目录单击进入**
  - 前置：位于根目录，存在目录项 `/docs`
  - 操作：单击 `docs` 行主体
  - 期望：路径切换到 `/docs`，列表展示目录内文件。

- **TC-2 row 菜单显示“打开”**
  - 操作：打开任意文件 row 菜单
  - 期望：存在 `data-action="open"`；不存在 `view/edit`。

- **TC-3 文件 row 菜单“打开”进入编辑器默认预览**
  - 操作：对文件执行 `open`
  - 期望：进入 `editor` 视图；`editorPreviewMode=true`（编辑器默认显示预览）。

- **TC-4 文件双击进入编辑器默认预览**
  - 操作：双击文件行主体
  - 期望：与 TC-3 结果一致。

- **TC-5 桌面/移动一致性**
  - 在 `window.innerWidth=1366/375` 下分别执行 TC-1/TC-3，结果一致。

- **TC-6 chat/template 一致性**
  - 在两个 scope 下执行 TC-2/TC-3，行为一致（允许模板下历史相关控件继续隐藏）。

- **TC-7 回归**
  - row 菜单 outside dismiss、单开规则相关既有用例继续通过。

## 风险与回滚方案

- **风险1：目录单击与菜单点击冲突**
  - 缓解：保持 row-actions 区域点击阻断，必要时增加更细粒度事件边界。
- **风险2：默认预览状态残留**
  - 缓解：进入 `open(file)` 时显式赋值 `editorPreviewMode=true`；离开 editor 现有 watcher 仍重置为 false。
- **风险3：动作枚举变更引发测试/分支遗漏**
  - 缓解：统一从 `useVfsFileManagerModel` 出发迁移，清理 `view/edit` 断言。

- **回滚方案**
  - 回滚本次 feature 提交即可恢复旧行为（目录双击进入、view/edit 菜单并存）。
  - 无数据迁移，无持久化结构变更，回滚成本低。
