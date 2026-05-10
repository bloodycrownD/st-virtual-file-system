# rename-modal-and-status-icon — 规格说明

## 变更动机与原因

在当前 VFS 文件管理交互中仍存在两个体验问题：

1. 重命名流程仍依赖浏览器原生 `alert/confirm/prompt`（或同类原生阻断式提示），与现有 VFS 风格化弹窗体系不一致。
2. 文件/文件夹行仅有名称与三点菜单，缺少对“当前状态”的可视提示，用户需要额外点开菜单才能确认状态。

本次变更目标是在不改动 VFS 核心读写规则的前提下，统一重命名交互风格，并在列表行增加状态图标表达。

## 本次变更范围

### 包含范围

- 将重命名相关原生提示替换为风格化弹窗（与现有 `VfsCreateEntityModal` / `VfsUnsavedEditorDialog` 风格一致）。
- 按“all-native-prompts”要求，清理本迭代涉及范围内遗留的原生 `alert/confirm/prompt`，统一到当前 VFS UI 风格。
- 在文件/文件夹行尾（三点菜单前）增加状态图标，语义为 **VFS 启用/禁用状态**。
- 桌面端与移动端保持一致展示与交互语义。
- 补充/更新自动化测试覆盖弹窗替换与状态图标渲染。

### 不包含范围

- 修改 `VfsCore`、快照结构、序列化协议、持久化格式。
- 重新设计文件管理信息架构或替换三点菜单行为。
- 将状态语义扩展到“策略状态/类型+状态复合图标”（本次仅做 enabled/disabled）。

## 功能需求

### FR-1 重命名不再使用原生提示

- 文件与目录重命名入口都必须使用风格化弹窗，不可出现原生 `alert/confirm/prompt`。
- 弹窗包含：标题、名称输入框、取消按钮、确认按钮、错误提示位。
- 输入校验规则与现有创建流程对齐（如非法名称、路径分隔符、`.`/`..` 等规则保持一致）。

### FR-2 本迭代范围内原生提示统一替换

- 与重命名相关及同一交互链路中仍存在的原生提示，一并替换为统一样式弹窗或统一 toast。
- 错误反馈采用现有 `toastr.error` / 统一错误映射，不使用原生阻断框。

### FR-3 行尾状态图标（enabled/disabled）

- 每个文件/目录行在三点菜单前显示一个状态图标，表示当前 VFS 启用/禁用状态。
- 图标需可访问：提供中文 `title` 和 `aria-label`。
- 图标仅表达状态，不改变行点击、三点菜单、选择/打开行为。

### FR-4 跨端一致性

- 桌面与移动下状态图标位置、显隐规则、重命名弹窗行为保持一致。
- 小视口下图标与三点菜单不得相互遮挡，行高与点击区域保持可用。

### FR-5 回归与稳定性

- 不回归现有 row/header action menu 的开关稳定性与 outside dismiss 行为。
- 测试必须覆盖：重命名弹窗渲染与提交流程、状态图标渲染与语义属性、关键交互回归。

## 验收标准

| AC | 描述 |
|----|------|
| AC-1 | 文件/目录重命名不再出现原生 `alert/confirm/prompt`，而是统一风格化弹窗。 |
| AC-2 | 在文件管理列表中，每一行三点菜单前都可看到状态图标，语义为启用/禁用。 |
| AC-3 | 状态图标具备中文 `title` 与 `aria-label`，可访问性满足基本读屏需求。 |
| AC-4 | 桌面/移动端展示一致，无明显错位、遮挡或点击冲突。 |
| AC-5 | `npm run test:run` 与 `npm run build` 通过，并包含本变更的测试更新。 |

## 影响文件（预估）

- `src/app/components/business-components/*Rename*.vue`（若新增重命名弹窗组件）
- `src/app/components/business-components/VfsFileManagerPanel.vue`
- `src/app/components/business-components/VfsActionMenu.vue`（若需调整触发链路）
- `src/app/screens/business-screens/VfsMainScreen.vue`（若重命名状态/弹窗状态在此托管）
- `test/vfs-ui-cr-loop.spec.ts`

## 文档确认

本 spec 供你确认后，再进入实现与测试。
