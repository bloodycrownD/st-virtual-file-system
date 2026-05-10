# select-custom-listbox-unification 设计方案

## 设计目标

- 用自绘 listbox 替换当前原生 `select`，消除 Win + Chromium 下展开态平台风格突变。
- 在不改变业务值域与提交协议的前提下，实现闭合态/展开态视觉统一。
- 保持 `VfsActionInputDialog` 现有 `text`、`range-number` 行为稳定，并补齐完整键盘与可访问性语义。

## 总体方案

基于当前代码现实（下拉渲染集中在 `VfsActionInputDialog`），采用**组件内统一渲染 + 字段协议兼容**的实现：

1. 保持字段协议不变（`type: 'select'` + `options` + `Record<string,string>` 提交）。
2. 将 `type: 'select'` 的模板从原生 `<select>` 改为：
   - 触发器：`button`（`role="combobox"`）
   - 下拉层：`ul`（`role="listbox"`）
   - 选项：`button/li`（`role="option"`）
3. 在 `VfsActionInputDialog` 内部实现可复用行为：
   - open/close 状态
   - active/selected 索引
   - 键盘导航与提交
   - 外部点击关闭
4. 所有样式使用组件命名空间类，不再依赖 `text_pole` 承载 select 主样式。

## 最终项目结构

- `src/app/components/business-components/VfsActionInputDialog.vue`
  - 新增自绘 listbox 结构、交互状态与 a11y 语义
- `src/app/screens/business-screens/VfsMainScreen.vue`
  - 仅保持字段定义与 payload 处理，不改业务语义（必要时仅适配测试标识）
- `test/vfs-ui-cr-loop.spec.ts`
  - 将 `SELECT` 标签断言迁移为 listbox 语义断言，补齐键盘/外部点击行为验证
- （可选）`src/styles/st-vfs-dialog.css`
  - 若需要全局弹窗层级/遮挡修正，添加最小作用域样式（仅 `#st-vfs-popup` 内）

## 变更点清单

1. **`VfsActionInputDialog.vue`**
   - 保留 `VfsActionInputField` 类型，新增 select 渲染相关内部状态：
     - `openSelectKey`
     - `activeOptionIndexByKey`
   - `type==='select'` 渲染改造：
     - 触发按钮显示当前 label 与箭头图标
     - 展开面板渲染 option 列表并高亮选中项
   - 交互规则：
     - Click: 打开/关闭/选择
     - Keyboard: `ArrowUp/ArrowDown/Enter/Escape/Tab`
     - Outside click: 关闭当前打开的 listbox
   - a11y：
     - `aria-expanded` / `aria-controls` / `aria-activedescendant`
     - `role="combobox"` / `role="listbox"` / `role="option"`
   - 样式：
     - 使用 `vfs-action-input-dialog__listbox*` 系列类名
     - 不依赖 `text_pole` 的 select 主体样式

2. **`VfsMainScreen.vue`**
   - 不变更策略字段定义与值域映射（`sortField/sortDirection/fill` 仍原协议）。
   - 仅在必要时补充测试用 `data-testid` 适配（若组件侧命名变化）。

3. **`test/vfs-ui-cr-loop.spec.ts`**
   - 将现有：
     - `element.tagName === 'SELECT'`
   - 改为：
     - combobox/listbox/option 语义与 data-testid 断言
   - 新增：
     - 键盘导航选择测试
     - 外部点击关闭测试
     - 选中值提交 payload 一致性测试

## 详细实现步骤

1. **实现 listbox 结构骨架**
   - 在 `VfsActionInputDialog` 中为 `type:'select'` 添加 trigger + popup + option 渲染。
   - 确保初始值从 `localValues[field.key]` 正确映射为显示标签。

2. **补齐交互行为**
   - 实现打开/关闭、选项点击、索引更新。
   - 实现键盘导航（含边界循环或钳制策略，按 spec 选定一种并保持一致）。
   - 实现 Escape/Tab 收起行为，避免焦点陷阱。

3. **接入外部点击关闭**
   - 在弹窗生命周期中挂载/卸载外部点击监听。
   - 不干扰已有弹窗关闭与 action menu 的 outside-dismiss 逻辑。

4. **样式统一与隔离**
   - 将自绘下拉样式集中到 `VfsActionInputDialog` scoped 区域。
   - 清理 `select` 对 `text_pole` 的耦合，只保留必要兼容类（若需）。

5. **测试迁移与补充**
   - 更新原有 select 标签断言。
   - 增加 listbox 行为测试（鼠标、键盘、外部点击、payload）。

6. **整体验证**
   - 运行针对性用例与构建，确认无回归。

## 测试策略

### 测试用例

1. **渲染一致性**
   - `type:'select'` 字段渲染为自绘 combobox，而非原生 `<select>`。
   - 当前值标签正确显示。

2. **鼠标交互**
   - 点击触发器展开列表；点击选项后写回并关闭。
   - 再次点击触发器可关闭。

3. **键盘交互**
   - `ArrowDown/ArrowUp` 变更 active 选项。
   - `Enter` 确认 active 选项。
   - `Escape` 关闭面板且不提交错误值。
   - `Tab` 收起并允许焦点继续流转。

4. **可访问性**
   - combobox/listbox/option 的 role 与 aria 状态正确更新。

5. **业务回归**
   - 展示策略三个选择项仍能正确保存并通过现有解析逻辑。
   - chat/template 作用域隔离用例继续通过。

6. **非下拉不回归**
   - `text` 与 `range-number` 输入行为不变。

## 风险与回滚方案

- **风险 1：自绘下拉引入焦点/键盘边界 bug**
  - 缓解：先在组件层完成完整键盘行为测试，再接入业务测试。

- **风险 2：外部点击关闭与现有菜单系统事件冲突**
  - 缓解：监听范围限定在 dialog 内部并在组件卸载时清理；优先使用 capture + target containment 判定。

- **风险 3：范围扩展后隐藏的下拉入口遗漏**
  - 缓解：以代码搜索 + 组件复用点清单确认（当前仓库下拉入口集中在 `VfsActionInputDialog`，后续若新增下拉必须复用该实现）。

- **回滚方案**
  - 单文件回滚 `VfsActionInputDialog.vue` 到原生 select 版本；
  - 回滚对应测试断言；
  - 业务侧 `VfsMainScreen` 无协议变更，回滚成本低。
