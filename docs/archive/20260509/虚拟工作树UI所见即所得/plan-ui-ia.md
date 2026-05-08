# 虚拟工作树 UI（交互与信息架构）设计方案

## 设计目标

- 落地 3 Tab 弹窗的信息架构与 Tab1 主流程。
- 落地文件/文件夹 7 动作的可见性与流转约束。
- 同时满足移动端与桌面端映射一致性（功能不减配）。
- 保证编辑页未保存退出行为和日志刷新交互符合已确认规则。

## 总体方案

- 使用“统一弹窗壳层 + Tab 路由状态 + 子页面组件化”模式。
- Tab1 负责文件系统主交互，Tab2/Tab3 只暴露入口占位与联动点（详细逻辑在其他 plan 实现）。
- 交互状态采用最小状态集：
  - 当前 Tab
  - 当前目录路径
  - 当前选中实体（文件/文件夹）
  - 当前页面模式（列表/阅读/编辑/幻灯片）
  - 编辑草稿脏状态（dirty）
- 移动端/桌面端使用同一交互语义，不同布局容器：
  - 移动端：单列路由式切换
  - 桌面端：双栏/多栏同屏

## 最终项目结构

```text
src/
  app/
    screens/
      business-screens/
        VfsMainScreen.vue
      pure-screens/
        VfsTabShellScreen.vue
        ReaderScreen.vue
        EditorScreen.vue
        SlideshowScreen.vue
    components/
      business-components/
        VfsFileManagerPanel.vue
        VfsActionMenu.vue
      pure-components/
        VfsFileList.vue
        VfsFolderList.vue
        VfsBreadcrumb.vue
        VfsLogTabStub.vue
        VfsCommitTabStub.vue
    composables/
      screens-composables/
        useVfsTabRouting.ts
        useVfsNavigation.ts
      components-composables/
        useVfsActionMenu.ts
        useVfsResponsiveLayout.ts
```

## 变更点清单

- 新增弹窗壳层与 3 Tab 信息架构实现。
- 新增文件/文件夹动作菜单策略（按实体类型过滤动作）。
- 新增 4 个页面模式：文件管理、阅读、编辑、幻灯片。
- 新增编辑页未保存退出拦截确认流程。
- 新增日志 Tab 触发规则：手动刷新 + 消息事件触发自动单次刷新。

## 详细实现步骤

1. 搭建 Tab 壳层与路由状态
   - 在 `VfsTabShellScreen.vue` 实现 Tab 切换与默认 Tab1。
   - 在 `useVfsTabRouting.ts` 维护 Tab 状态与恢复逻辑。
   - 验证：首次打开默认 Tab1；切换后状态保持。

2. 实现 Tab1 文件管理页面骨架
   - 在 `VfsMainScreen.vue` 组装目录浏览、面包屑、文件列表。
   - 支持进入目录、返回上级目录。
   - 验证：目录导航完整且无死链。

3. 实现动作菜单可见性与分发
   - `VfsActionMenu.vue` 按实体类型渲染动作：
     - 文件：切换状态/删除/查看/编辑/重命名
     - 文件夹：切换状态/删除/重命名/展示策略/幻灯片
   - 验证：非法动作不显示且不可触发。

4. 实现阅读/编辑/幻灯片流转
   - 查看 -> `ReaderScreen.vue`
   - 编辑 -> `EditorScreen.vue`
   - 幻灯片 -> `SlideshowScreen.vue`
   - 验证：三条主路径均可进入并返回。

5. 实现编辑页未保存离开规则
   - 记录 dirty 状态。
   - 离开编辑页时弹确认；用户强制退出则放弃草稿。
   - 验证：确认弹窗正确触发；强制退出不保存。

6. 实现跨端布局映射
   - `useVfsResponsiveLayout.ts` 根据屏宽切换布局容器。
   - 保持动作位置、命名、反馈一致。
   - 验证：同动作在移动/桌面行为一致。

7. 实现日志刷新交互钩子（UI 层）
   - Tab3 提供手动刷新按钮。
   - 监听消息编辑/收到消息事件触发一次自动刷新。
   - 验证：事件触发一次刷新，不重复刷爆。

## 测试策略

- 以 UI 集成测试 + 关键交互手测为主。
- 重点覆盖“动作可见性、页面流转、未保存退出、跨端一致性”。

### 测试用例

- 打开弹窗默认进入 Tab1。
- 文件节点只出现文件动作；文件夹节点只出现文件夹动作。
- 查看/编辑/幻灯片入口均可进入目标页面并可返回。
- 编辑页有改动时离开触发确认；强制退出后草稿不保留。
- 移动端与桌面端执行同一动作，结果一致。
- Tab3 手动刷新可用；消息编辑/收到消息事件触发一次自动刷新。

## 风险与回滚方案

- 风险：多页面模式切换可能导致状态错位（例如选中项与展示页不同步）。
  - 缓解：统一通过 `useVfsNavigation.ts` 驱动跳转，不在组件内隐式跳转。
- 风险：响应式布局切换造成同一状态重复渲染。
  - 缓解：布局层只切视图容器，不切业务状态来源。
- 回滚方案：
  - 保留旧 UI 入口开关（feature flag）。
  - 分阶段上线：先 Tab1 主流程，再启用编辑/幻灯片增强流转。
