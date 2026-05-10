# row-menu-portal-stable-overlay — 实施方案

## 目标重申（效果导向）

同时满足：

1. **几何**：行菜单 **不参与** `ul.vfs-fm-list` 的溢出伸缩把戏——消灭打开菜单带来的 **无谓滚动条/滚动范围变化**（对齐旧 `row-menu-position-fix` 的用户可见目标）。
2. **交互**：**立即**注册 teardown 友好的 dismiss，无「第三条路径 defer」导致的卡住（对齐 `row-menu-stable-parity` 的稳定监听模型）。

**不限定**具体实现手法；以下为候选顺序，以实现成本低、风险小者优先。

## 候选方案（择一或组合）

### A. 浮层移出滚动子树（推荐优先考虑）

- 将 **菜单面板**（而非整块 `details`）渲染到 **非 `vfs-fm-list` 后代** 的节点：例如 Vue `Teleport` 到 `#st-vfs-popup` / `.st-vfs-popup__app` 下的专用容器，或使用宿主已有对话框层。
- 三点仍为 **`summary`/触发器**（可留在行内）；面板位置用 **`getBoundingClientRect(trigger)`** 计算，`position: fixed` 锚定于视口（或使用等价坐标系）。
- **监听**：与当前 header/stable 路径一致——**同步** `document` capture `click` + `AbortController`，菜单关闭即 abort。

### B. 保持在 DOM 树内但切断溢出贡献

- 尝试 **`contain`、`clip-path`、isolate stacking** 等纯 CSS 手段减轻滚动溢出；历史经验：**单靠 CSS 往往不足以** 在所有浏览器下满足 FR-2，可作为辅助而非唯一手段。

### C. 行内保留 `details`，面板单独组件

- 触发器仍在行内；面板由独立子组件挂载到 popup 层，父组件通过 provide/inject 或事件传递 **当前 entity + rect**。利于测试分裂，但注意 **单开互斥** 仍遍历 popup 内 `details.vfs-action-menu`。

## 实施步骤（建议）

1. **基线与复现**：在「长列表 + 有纵向滚动条」下录制：`scrollHeight`、`scrollTop`、菜单开关序列（可参考用户截图场景）。
2. **几何**：实现「面板不在 `vfs-fm-list` overflow 计算路径」中的一种（优先 A）；对齐 **`overlay-right-bottom`** 或使用与设计一致的锚点（与旧 position-fix 一致即可）。
3. **监听**：复用 **单次打开创建 AbortController、关闭/unmount abort**；避免 deferred bind；保留 `closePeerMenus`。
4. **样式**：z-index 限制在 popup 作用域；避免全局污染。
5. **测试**：扩展 `vfs-ui-cr-loop.spec.ts`：若 jsdom 对滚动度量不完整，至少保留 **多次 dismiss/reopen** 与 **互斥**；可选：对 `scrollTop` 做「前后相等」断言（在可控 wrapper 高度下）。
6. **验证**：`npm run test:run`、`npm run build`；执行 spec **AC-1～AC-3** 手工清单。

## 与历史文档的关系

- **`row-menu-position-fix`**：FR/AC 的用户意图由本 feature **FR-1、FR-2** 承接；旧版若强调「overlay」而不强调「监听模型」，以本 feature 为准统一验收。
- **`row-menu-stable-parity`**：**FR-3、FR-4** 承接其交互结论；本 feature **取代**其「可与 header 完全同源 CSS」的表述——**header 与 row 允许呈现一致，但 row 允许为 FR-2 使用不同挂载层级**。

## 风险与回滚

- **风险**：Teleport 与 `summary` 焦点、屏幕阅读器、键盘导航的边际行为；需在手工 AC 中快速扫一眼。
- **回滚**：保留独立分支；若几何方案失败，回到「仅 stable CSS」需接受 FR-2 可能不满足——不应作为最终状态。

## 完成定义

- `spec.md` 中 FR-1～FR-5 与 AC-1～AC-5 均有 **代码位置 + 测试或手工记录** 对应；
- 无已知「第三次点开失灵」与「开关菜单无谓滚动」复现路径。
