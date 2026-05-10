# VFS-Display-Strategy-Update 设计方案

## 设计目标

- 将“展示策略”入口从行级菜单迁移到 header 菜单，且仅在非根目录可见。
- 展示策略弹窗字段与 `spec.md` 保持一致：排序方式、排序方向、头部读取、尾部读取、填充策略。
- 控件规范统一：枚举项使用 `select`，数字项使用“滑块 + input”联动。
- 配置读取/保存遵循作用域隔离（chat/template），并支持默认值回退。

## 总体方案

基于现有 `VfsMainScreen` 的 action 分发与 `VfsActionInputDialog` 模式扩展实现，不新建独立弹窗组件：

1. **入口迁移**
   - 从 `VfsActionMenu` 的 `entity-actions` 模式中移除 `apply-strategy`（行级不再显示）。
   - 在 `VfsFileManagerPanel` header 的 actions 区域新增“展示策略”按钮（`menu_button`），由 `VfsMainScreen` 控制显示条件：`currentDirectoryPath !== '/'`。

2. **弹窗字段升级**
   - 扩展 `VfsActionInputDialog` 字段模型，支持：
     - `select`（枚举项）
     - `range+number` 组合（数字项）
   - 在 `apply-strategy` 打开时构造 5 个字段，并从“当前目录规则（override）或默认规则”预填。

3. **配置读写统一**
   - 读取：优先 `directoryOverrides[currentDirectoryPath]`，否则 `defaultRule`。
   - 保存：
     - 写回当前 scope 的 `workTree.directoryOverrides[currentDirectoryPath]`
     - `directoryRulesEnabled[currentDirectoryPath] = true`
   - 数值项在提交前进行 `0..1000` 约束与取整；枚举项严格白名单校验。

4. **兼容已有行为**
   - 不改 `work-tree` 渲染算法、`DirectoryRule` 类型、序列化协议。
   - 不影响 header 现有“新建目录/新建文件”菜单逻辑。

## 最终项目结构

- `src/app/screens/business-screens/VfsMainScreen.vue`（入口显示、动作分发、规则读写）
- `src/app/components/business-components/VfsFileManagerPanel.vue`（header actions 插槽新增“展示策略”触发位）
- `src/app/components/business-components/VfsActionMenu.vue`（移除 row 的展示策略项）
- `src/app/components/business-components/VfsActionInputDialog.vue`（新增字段类型与控件渲染能力）
- `test/vfs-ui-cr-loop.spec.ts`（新增迁移与交互回归）

## 变更点清单

1. **`VfsActionMenu.vue`**
   - `ACTION_LABELS` 去掉 `apply-strategy` 展示（或在 `entity-actions` 下过滤）。
   - 保持 `open / rename / delete / toggle-status / open-slideshow` 的现有可见性逻辑。

2. **`VfsMainScreen.vue`**
   - 新增 `isNonRootDirectory` 计算属性。
   - header actions 中追加“展示策略”按钮（仅非根目录渲染）。
   - 新增 `openDisplayStrategyDialogForCurrentDirectory()`：
     - 从当前 scope `workTree` 读取目录规则并预填 5 项。
   - 调整 `onInputDialogConfirm` 中 `apply-strategy` 分支：
     - 接收 5 项 payload（sortField/sortDirection/headCount/tailCount/fill）
     - 校验并落库到当前 scope。
   - `handleEntityAction('apply-strategy')` 保留兼容但不再由 row 触发（可转发到当前目录实现兜底）。

3. **`VfsActionInputDialog.vue`**
   - 扩展字段协议（建议）：
     - `type: 'text' | 'select' | 'range-number'`
     - `options?: Array<{ label: string; value: string }>`
     - `min/max/step?: number`
   - 渲染规则：
     - `select` 使用 `<select>`
     - `range-number` 同行渲染 `<input type="range"> + <input type="number">` 并双向同步
   - 保持现有 `rename` 文本输入路径兼容（默认 `text`）。

4. **作用域持久化修正**
   - 当前代码中展示策略保存仅调用 `updateChat`；需根据 `scope` 分流：
     - chat: `updateChat`
     - template: 通过 extension/template 对应持久化段保存 `workTree`（与当前架构一致地补齐）
   - 同步更新本地响应式镜像（当前已有 `syncReactiveWorkTree()` 仅 chat，需要 scope-aware）。

## 详细实现步骤

1. **入口层改造**
   - 在 `VfsMainScreen` 的 `VfsFileManagerPanel #actions` 中加入展示策略按钮。
   - 条件渲染：当前目录非根目录才显示。
   - 按钮点击打开输入弹窗（`inputDialogState`）。

2. **行菜单剥离**
   - 修改 `VfsActionMenu` 的 entity actions 列表与文案，确保 row 菜单不再出现“展示策略”。
   - 回归检查 row 菜单布局/交互稳定性（不引入 ghost/scroll 回归）。

3. **输入弹窗字段升级**
   - 扩展 `VfsActionInputDialog` props 的字段类型定义与渲染分支。
   - 增加 range+number 联动逻辑（value 统一走字符串模型，提交时由父层归一化）。

4. **规则读取与提交**
   - 打开弹窗时读取当前目录 rule（override > default）。
   - 提交时进行规范化：
     - `sortField`: `name | ctime | mtime`
     - `sortDirection`: `asc | desc`
     - `fill`: `filename | frontmatter | omit`
     - `headCount/tailCount`: `Math.floor(clamp(0,1000))`
   - 将规范化规则写入当前目录 override 并启用目录规则。

5. **作用域隔离**
   - 让展示策略读写遵循 `props.scope`。
   - 验证 chat/template 下各自保存与互不串扰。

6. **测试补齐与回归**
   - 在 `vfs-ui-cr-loop.spec.ts` 增加入口迁移、控件类型、提交保存与作用域隔离用例。
   - 运行 `npm run build`、`npm test`。

## 测试策略

### 测试用例

1. **入口可见性**
   - 根目录不显示“展示策略”按钮。
   - 进入 `/docs` 后显示该按钮。

2. **入口迁移**
   - row 菜单中不含 `apply-strategy` 动作。
   - header 按钮可打开展示策略弹窗。

3. **字段完整性**
   - 弹窗包含 5 项：排序方式、排序方向、头部读取、尾部读取、填充策略。
   - 3 个枚举项为 `select`；2 个数字项为 `range + number`。

4. **数值联动与约束**
   - 改滑块会同步 number 输入框。
   - 输入越界值后提交按 `0..1000` 约束保存。

5. **规则保存**
   - 提交后 `directoryOverrides[currentDirectory]` 按预期更新。
   - `directoryRulesEnabled[currentDirectory]` 自动为 `true`。

6. **作用域隔离**
   - chat 中保存不影响 template。
   - template 中保存不影响 chat。

7. **回归**
   - header/row action menu 的 outside-dismiss、互斥、滚动稳定性继续通过。

## 风险与回滚方案

- **风险 1：输入弹窗字段协议扩展影响 rename 流程**
  - 方案：字段类型默认 `text`，rename 路径不改 payload 契约；补充 rename 回归测试。

- **风险 2：scope 持久化分流不完整导致 template 不生效**
  - 方案：将读写集中在单一 helper 中（scope-aware），并加 chat/template 对照测试。

- **风险 3：header 新按钮影响现有 action 区布局**
  - 方案：复用现有 `menu_button` 与 action-group，不新增复杂容器；若出现布局问题可快速回退为仅文本按钮。

- **回滚方案**
  - 代码回滚以文件粒度进行：
    1. 回退 `VfsActionInputDialog` 字段扩展；
    2. 回退 `VfsMainScreen` header 入口与提交逻辑；
    3. 恢复 `VfsActionMenu` 中 `apply-strategy` 行菜单入口；
  - 保留测试用例，逐步恢复以定位最小问题面。
