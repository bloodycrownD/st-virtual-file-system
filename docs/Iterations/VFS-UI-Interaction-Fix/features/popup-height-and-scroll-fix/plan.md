# popup-height-and-scroll-fix 设计方案

## 设计目标

- 将 VFS 弹窗高度固定到可用但稳定的范围（70vh），避免“过矮”观感。
- 让“更多操作”以 overlay 展示，不参与主布局高度，避免触发主弹窗滚动。
- 将滚动职责收敛到局部容器（主要是文件列表区），提升交互稳定性。

## 总体方案

### 1) 弹窗容器高度策略

- 在 `#st-vfs-popup` 上设置：
  - `height: 70vh`
  - `max-height: 85vh`（视口保护）
  - `overflow: hidden`（禁止主容器因下拉菜单展开而滚动）
- `#st-vfs-popup-app` 采用纵向 flex 布局，确保 header 固定、内容区按剩余高度分配。

### 2) 文件管理内容区分层

- `VfsMainScreen` 的 files/list 布局中：
  - 头部操作区固定
  - 列表容器独立滚动（`overflow: auto`）
- 避免把滚动挂在 `dialog` 或 `vfs-main-layout` 根节点。

### 3) 更多操作菜单 overlay 化

- `VfsActionMenu` 保持 `position: absolute` 浮层，但补充：
  - 更高 `z-index`
  - 父容器 `overflow: visible`
  - 菜单最大高度与自身滚动（仅菜单内部滚动，不影响主布局）
- 如空间不足，优先向上翻转（可选后续优化），本次先保证不挤压主容器。

## 最终项目结构

```text
docs/Iterations/VFS-UI-Interaction-Fix/features/popup-height-and-scroll-fix/
  spec.md
  plan.md

src/styles/
  st-vfs-dialog.css                # 弹窗高度/overflow 主策略

src/app/screens/business-screens/
  VfsMainScreen.vue                # files/list 区域滚动层级调整（如需要）

src/app/components/business-components/
  VfsActionMenu.vue                # overlay 菜单层级与滚动策略
```

## 变更点清单

- `src/styles/st-vfs-dialog.css`
  - 设置 `#st-vfs-popup` 固定高度（70vh）与 `overflow: hidden`
  - `#st-vfs-popup-app` 内容分区（header + content）的高度与 flex 行为

- `src/app/screens/business-screens/VfsMainScreen.vue`（按需）
  - files/list 容器高度分配
  - 列表区域独立滚动

- `src/app/components/business-components/VfsActionMenu.vue`
  - 菜单 overlay 不挤压布局
  - 菜单自身最大高度与内部滚动

## 详细实现步骤

1. 在 `st-vfs-dialog.css` 先落地弹窗 70vh + overflow hidden 主策略
2. 调整 `VfsActionMenu` 浮层层级/overflow，确认展开不触发主容器滚动
3. 若仍有滚动问题，再在 `VfsMainScreen` 增加 list 区局部滚动容器
4. 回归测试展开/收起更多操作、多次操作稳定性
5. `npm run build` 验证

## 测试策略

### 测试用例

- **TC-1 弹窗高度**
  - 打开 VFS 弹窗，确认高度约为 70vh，视觉不再偏短

- **TC-2 更多操作展开**
  - 多次展开/收起更多操作，主弹窗不出现突兀纵向滚动

- **TC-3 菜单可见性**
  - 更多操作菜单完整显示，不被裁切，菜单项可点击

- **TC-4 稳定性**
  - 连续展开/关闭菜单、切换目录后，布局不抖动

## 风险与回滚方案

- **风险**：固定 70vh 在极小屏可能偏大。
  - 缓解：保留 `max-height` 与媒体查询兜底。
- **回滚**：
  - 回退 `st-vfs-dialog.css` 中高度/overflow 策略，恢复之前自适应高度方案。

