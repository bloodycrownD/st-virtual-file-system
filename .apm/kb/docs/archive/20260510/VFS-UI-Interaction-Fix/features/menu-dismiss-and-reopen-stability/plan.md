# menu-dismiss-and-reopen-stability 设计方案

## 设计目标

- 修复 row 菜单外部关闭后无法再次打开的问题。
- 让 header + row 菜单都支持可靠外部点击关闭。
- 统一互斥规则与状态管理，避免“谁负责关/开”的竞态。

## 总体方案

### 1) 统一受控的 open/close 生命周期

- 对 `VfsActionMenu` 引入“受控开关”策略（不再依赖浏览器默认 `details/summary` 在复杂事件链里的隐式切换）：
  - 点击 toggle：发起“打开请求”
  - 外部点击：发起“关闭请求”
  - 打开请求会先执行互斥关闭，再打开当前菜单

实现要点：
- 通过 `detailsRef` 显式设置/移除 `open` 属性。
- 对“点击 toggle 时 menu 已 open”的情况：不强制 toggle 关闭（符合 FR-4）。

### 2) 互斥关闭范围收敛（仅 VFS popup 内）

- 在打开请求时，关闭同一弹窗范围内所有其它 `details.vfs-action-menu[open]`。
- 范围选择：
  - 优先从当前菜单向上找到 `#st-vfs-popup` 或 `.st-vfs-popup__app`（若可用）
  - 回退到 `.vfs-tab-shell` 作为最小容器
- 避免关闭宿主页面其它 `details`。

### 3) 外部点击关闭（header + row 共用）

- 当菜单打开时注册 `document.addEventListener('click', ..., true)`：
  - capture 阶段判断点击是否发生在该 `details` 内
  - 若不在，关闭该菜单
  - 若在，保持打开（菜单项点击由现有逻辑负责关闭）
- 关闭后注销监听，避免泄漏与重复注册。

### 4) 回归测试补齐

- 在 `test/vfs-ui-cr-loop.spec.ts` 增加覆盖：
  - **AC-1**：row 菜单按“open → outside close → open”循环 10 次不卡死
  - **AC-2**：header 菜单 outside click 关闭
  - **AC-3**：header 与 row 互斥（打开 header 会关 row；打开 row 会关 header）
  - **AC-4**：outside dismiss 后 scrollTop 与选中态稳定

## 预期改动文件

- `src/app/components/business-components/VfsActionMenu.vue`
  - 统一 open/close 请求入口
  - 外部点击关闭（适用于 header + row）
  - 互斥关闭逻辑改为 popup 范围内

- `test/vfs-ui-cr-loop.spec.ts`
  - 新增上述回归测试用例

## 实施步骤

1. 在 `VfsActionMenu` 中梳理现有 `onToggleClick` / `@toggle` 时序，移除“强制 toggle 关闭”行为，改为“打开请求”语义。
2. 将互斥关闭范围从组件局部 heuristic 收敛到 popup 范围。
3. 将 outside dismiss 扩展到 header 模式与 row 模式统一生效，并确保 teardown 正确。
4. 补测试 + 跑 `npm run test:run -- test/vfs-ui-cr-loop.spec.ts` + `npm run build`。

## 风险与回滚方案

- **风险**：过度受控可能影响 `details/summary` 默认键盘行为。  
  - 缓解：保持 `summary` 语义与 `aria-label/title`，仅在 click 时拦截默认 toggle。
- **回滚**：如发现行为与宿主冲突，可回滚到仅 row 菜单受控、header 保持原生 details 行为的折中方案。
